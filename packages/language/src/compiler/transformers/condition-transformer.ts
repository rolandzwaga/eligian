/**
 * Condition transformation (Langium Expression → Eligius `when` expression string).
 *
 * Eligius 3's `when` operation takes `operationData: { expression: string }` and parses it with
 * its own grammar (`eligius/src/operation/helper/parse-expression.ts`):
 *
 *   or         := and ('||' and)*
 *   and        := comparison ('&&' comparison)*
 *   comparison := unary (('==' | '!=' | '>=' | '<=' | '>' | '<') unary)?
 *   unary      := '!' unary | primary
 *   primary    := '(' or ')' | operand
 *
 * Operands are numbers, single-quoted strings, `true`/`false`/`null`, and unquoted property
 * chains starting with `$operationdata.`, `$globaldata.` or `$scope.`. Arithmetic is not
 * supported, so sub-expressions that cannot be folded at compile time are rejected.
 *
 * This is separate from `transformExpression`, whose JsonValue output is used for operation
 * arguments and must not change.
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import { type Expression, isProgram } from '../../generated/ast.js';
import { evaluateExpression } from '../expression-evaluator.js';
import { transformExpression } from './expression-transformer.js';
import { createEmptyScope, type ScopeContext } from './scope.js';
import { getSourceLocation } from './source-location.js';

type Literal = string | number | boolean | null;

/** A serialized sub-expression: a compile-time literal, or expression text. */
type ConditionPart =
  | { kind: 'literal'; value: Literal }
  | { kind: 'text'; text: string; op?: string };

const comparisonOperators = new Set(['==', '!=', '>=', '<=', '>', '<']);
const logicalOperators = new Set(['&&', '||']);

// Characters that end an operand in the Eligius tokenizer. A quote inside a string literal
// followed by one of these would end the string early.
const unsafeQuotePattern = /'[\s()!=<>&|]/;

/**
 * Transform an `if` condition → Eligius `when` expression string.
 *
 * Literal sub-expressions are folded at compile time. A condition that folds entirely
 * becomes `'true'` or `'false'` (the Eligius keywords, as an expression string).
 */
export const transformCondition = (
  expr: Expression,
  scope: ScopeContext = createEmptyScope()
): Effect.Effect<string, TransformError> =>
  Effect.gen(function* () {
    const part = yield* serializeCondition(expr, scope);
    if (part.kind === 'literal') {
      return part.value ? 'true' : 'false';
    }
    return part.text;
  });

const serializeCondition = (
  expr: Expression,
  scope: ScopeContext
): Effect.Effect<ConditionPart, TransformError> =>
  Effect.gen(function* () {
    const constants = new Map([
      ...scope.programConstants.entries(),
      ...scope.scopedConstants.entries(),
    ]);
    const folded = evaluateExpression(expr, constants);
    if (folded.canEvaluate) {
      return { kind: 'literal' as const, value: folded.value! };
    }

    switch (expr.$type) {
      case 'BinaryExpression': {
        if (!comparisonOperators.has(expr.op) && !logicalOperators.has(expr.op)) {
          return yield* failCondition(
            expr,
            `Operator '${expr.op}' is not supported in conditions unless both sides are constants (Eligius conditions have no arithmetic)`
          );
        }
        const left = yield* serializeCondition(expr.left, scope);
        const right = yield* serializeCondition(expr.right, scope);
        const leftText = yield* operandText(left, expr.op, expr.left);
        const rightText = yield* operandText(right, expr.op, expr.right);
        return { kind: 'text' as const, text: `${leftText} ${expr.op} ${rightText}`, op: expr.op };
      }

      case 'UnaryExpression': {
        if (expr.op !== '!') {
          return yield* failCondition(
            expr,
            `Operator '${expr.op}' is not supported in conditions unless its operand is a constant`
          );
        }
        const operand = yield* serializeCondition(expr.operand, scope);
        return {
          kind: 'text' as const,
          text: `!${yield* operandText(operand, '!', expr.operand)}`,
        };
      }

      case 'NullLiteral':
        return { kind: 'literal' as const, value: null };

      case 'PropertyChainReference':
        return {
          kind: 'text' as const,
          text: `$${expr.scope}.${expr.properties.join('.')}`,
        };

      case 'VariableReference': {
        // Program-level variables that are not constants are stored in global data
        // (see the setData init action in ast-transformer.ts)
        const declaration = expr.variable?.ref;
        if (declaration && isProgram(declaration.$container)) {
          return { kind: 'text' as const, text: `$globaldata.${declaration.name}` };
        }
        return yield* referenceChain(expr, scope);
      }

      case 'SystemPropertyReference':
      case 'ParameterReference':
        return yield* referenceChain(expr, scope);

      default:
        return yield* failCondition(
          expr,
          `${expr.$type} is not supported in conditions; use a value, a reference or a comparison`
        );
    }
  });

/** Resolves a reference via transformExpression, which yields its property chain string. */
const referenceChain = (
  expr: Expression,
  scope: ScopeContext
): Effect.Effect<ConditionPart, TransformError> =>
  Effect.gen(function* () {
    const value = yield* transformExpression(expr, scope);
    if (typeof value !== 'string') {
      return yield* failCondition(expr, `Reference did not resolve to a property chain`);
    }
    return { kind: 'text' as const, text: value };
  });

/**
 * Text for an operand of `parentOp`, parenthesized where Eligius needs it (comparisons do not
 * chain, `!` binds tightest) or where mixing `&&` and `||` would otherwise be hard to read.
 */
const operandText = (
  part: ConditionPart,
  parentOp: string,
  expr: Expression
): Effect.Effect<string, TransformError> =>
  Effect.gen(function* () {
    if (part.kind === 'literal') {
      return yield* literalText(part.value, expr);
    }
    if (part.op === undefined) {
      return part.text;
    }
    const needsParens =
      parentOp === '!' ||
      comparisonOperators.has(parentOp) ||
      (part.op !== parentOp && !comparisonOperators.has(part.op));
    return needsParens ? `(${part.text})` : part.text;
  });

const literalText = (value: Literal, expr: Expression): Effect.Effect<string, TransformError> =>
  Effect.gen(function* () {
    if (typeof value === 'string') {
      if (unsafeQuotePattern.test(value)) {
        return yield* failCondition(
          expr,
          `String "${value}" cannot be used in a condition: a quote followed by a space, operator or parenthesis would end the string`
        );
      }
      return `'${value}'`;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return yield* failCondition(expr, `Number ${value} cannot be used in a condition`);
    }
    return String(value);
  });

const failCondition = (expr: Expression, message: string) =>
  Effect.fail({
    _tag: 'TransformError' as const,
    kind: 'InvalidExpression' as const,
    message,
    location: getSourceLocation(expr),
  });
