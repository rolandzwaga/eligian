/**
 * Time constants and event time references (audit feature idea #10), shared
 * by the compiler, the IDE's time resolver and the validators so they all
 * agree on what `@beat` and `intro.end` mean.
 *
 *   const beat = 7s
 *   const outro = @beat * 2 + 500ms
 *   at 15s for @beat as editBeat [ ... ]
 *   stagger 200ms ["#a", "#b"] at editBeat.end with reveal() for 1.5s
 */
import {
  type EventTimeReference,
  type Expression,
  isBinaryExpression,
  isNumberLiteral,
  isSequenceBlock,
  isTimedEvent,
  isTimeValue,
  isUnaryExpression,
  isVariableDeclaration,
  isVariableReference,
  type LabeledEvent,
  type Timeline,
  type VariableDeclaration,
  type VariableReference,
} from '../generated/ast.js';
import { convertTimeToSeconds } from './time-units.js';

/** A time constant's value in seconds, or why it is not one. */
export type TimeConstantValue =
  | { readonly seconds: number; readonly error?: undefined }
  | { readonly seconds?: undefined; readonly error: string };

const notATime = (name: string) =>
  `'@${name}' cannot be used as a time: its value must be a time (7s), a number (seconds) or arithmetic on them`;

/**
 * The value in seconds of the constant `reference` points to. A unitless
 * number counts as seconds, as in every time position.
 */
export function timeConstantValue(reference: VariableReference): TimeConstantValue {
  const declaration = reference.variable?.ref;
  const name = reference.variable?.$refText ?? '?';
  if (!isVariableDeclaration(declaration)) {
    return { error: notATime(name) };
  }
  return evaluateDeclaration(declaration, new Set());
}

function evaluateDeclaration(
  declaration: VariableDeclaration,
  visiting: Set<VariableDeclaration>
): TimeConstantValue {
  if (visiting.has(declaration)) {
    return { error: `'@${declaration.name}' refers to itself through other constants` };
  }
  visiting.add(declaration);
  try {
    return evaluate(declaration.value, declaration.name, visiting);
  } finally {
    visiting.delete(declaration);
  }
}

function evaluate(
  expr: Expression | undefined,
  name: string,
  visiting: Set<VariableDeclaration>
): TimeConstantValue {
  if (isTimeValue(expr)) return { seconds: convertTimeToSeconds(expr.value, expr.unit) };
  if (isNumberLiteral(expr)) return { seconds: expr.value };
  if (isUnaryExpression(expr) && expr.op === '-') {
    const operand = evaluate(expr.operand, name, visiting);
    return operand.error === undefined ? { seconds: -operand.seconds } : operand;
  }
  if (isBinaryExpression(expr) && ['+', '-', '*', '/'].includes(expr.op)) {
    const left = evaluate(expr.left, name, visiting);
    if (left.error !== undefined) return left;
    const right = evaluate(expr.right, name, visiting);
    if (right.error !== undefined) return right;
    switch (expr.op) {
      case '+':
        return { seconds: left.seconds + right.seconds };
      case '-':
        return { seconds: left.seconds - right.seconds };
      case '*':
        return { seconds: left.seconds * right.seconds };
      default:
        return right.seconds === 0
          ? { error: `'@${name}' divides a time by zero` }
          : { seconds: left.seconds / right.seconds };
    }
  }
  if (isVariableReference(expr)) {
    const declaration = expr.variable?.ref;
    return isVariableDeclaration(declaration)
      ? evaluateDeclaration(declaration, visiting)
      : { error: notATime(expr.variable?.$refText ?? name) };
  }
  return { error: notATime(name) };
}

/**
 * Whether the constant holds a time value (`7s`), directly or through the
 * constants it refers to. Such a constant only has a meaning in times.
 */
export function isTimeConstant(
  declaration: VariableDeclaration,
  visiting: Set<VariableDeclaration> = new Set()
): boolean {
  if (visiting.has(declaration)) return false;
  visiting.add(declaration);
  const involves = (expr: Expression | undefined): boolean => {
    if (!expr) return false;
    if (isTimeValue(expr)) return true;
    if (isUnaryExpression(expr)) return involves(expr.operand);
    if (isBinaryExpression(expr)) return involves(expr.left) || involves(expr.right);
    if (isVariableReference(expr)) {
      const target = expr.variable?.ref;
      return isVariableDeclaration(target) && isTimeConstant(target, visiting);
    }
    return false;
  };
  return involves(declaration.value);
}

/** Message for a time constant used where it has no meaning (an operation argument, ...). */
export const timeConstantMisuseMessage = (name: string): string =>
  `'@${name}' is a time constant: it can only be used in times (at, for, sequence, stagger, duration)`;

/** Message for a time value (`7s`) outside a program-level constant. */
export const TIME_VALUE_PLACEMENT_MESSAGE =
  "A time like 7s can only be the value of a program-level const (const beat = 7s); refer to it as '@beat' in times";

/** The edges an event time reference may name. */
export type EventEdge = 'start' | 'end';

export const isEventEdge = (edge: string | undefined): edge is EventEdge =>
  edge === 'start' || edge === 'end';

/** Message for `intro.middle`. */
export const eventEdgeMessage = (reference: EventTimeReference): string =>
  `'${reference.event?.$refText}.${reference.edge}': an event label has '.start' and '.end'`;

/** Message for a reference to the referencing event itself or to a later event. */
export const laterEventMessage = (label: string): string =>
  `'${label}' is not defined before this time: a time can only refer to events earlier in the timeline`;

/**
 * The labeled events of `timeline` in order: `at … as x` events and (idea #11)
 * labeled sequence items.
 */
export function labeledEvents(timeline: Timeline): LabeledEvent[] {
  const result: LabeledEvent[] = [];
  for (const event of timeline.events) {
    if (isSequenceBlock(event)) {
      result.push(...event.items.filter(item => item.name));
    } else if (isTimedEvent(event) && event.name) {
      result.push(event);
    }
  }
  return result;
}
