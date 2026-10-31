/**
 * Expression Evaluator - Compile-time constant expression evaluation
 *
 * This module implements compile-time evaluation of constant expressions
 * for User Story 3 (P3). It evaluates simple expressions like:
 * - Arithmetic: 10 + 20 → 30
 * - String concatenation: "Hello" + " World" → "Hello World"
 * - Logical operations: true && false → false
 * - Transitive constants: A + 3 (where A is a known constant)
 *
 * Design principles:
 * - Safe evaluation (no eval(), no arbitrary code execution)
 * - Graceful failure (return error result instead of throwing)
 * - Support only simple expressions (literals, binary ops, unary ops, constant refs)
 * - Detect circular dependencies
 *
 * Related: quickstart.md Step 4, research.md section 2
 */

import type {
  ArrayLiteral,
  BooleanLiteral,
  Expression,
  NumberLiteral,
  ObjectLiteral,
  StringLiteral,
  VariableReference,
} from '../generated/ast.js';
import type { JsonValue } from './types/common.js';
import type {
  ConstantMap,
  ConstantValue,
  ExpressionEvaluationResult,
} from './types/constant-folding.js';

/**
 * Evaluate a constant expression at compile time
 *
 * Attempts to evaluate the given expression to a literal value.
 * Supports arithmetic, string concatenation, logical operations,
 * and references to other constants.
 *
 * @param expr - The expression to evaluate
 * @param constants - Map of known constants (for resolving variable references)
 * @param evaluating - Set of constants currently being evaluated (for cycle detection)
 * @returns Evaluation result with value or error
 *
 * @example
 * ```typescript
 * const expr = parseBinaryExpression('10 + 20');
 * const result = evaluateExpression(expr, new Map());
 * // result.canEvaluate === true, result.value === 30
 * ```
 */
export function evaluateExpression(
  expr: Expression,
  constants: ConstantMap,
  evaluating: Set<string> = new Set()
): ExpressionEvaluationResult {
  try {
    const value = evaluateExpressionInternal(expr, constants, evaluating);
    return { canEvaluate: true, value };
  } catch (error) {
    return {
      canEvaluate: false,
      error: {
        reason: error instanceof Error ? error.message : String(error),
        invalid: error instanceof InvalidConstantExpression,
        expression: expr.$cstNode?.text ?? 'unknown',
        sourceLocation: {
          line: expr.$cstNode?.range.start.line ?? 0,
          column: expr.$cstNode?.range.start.character ?? 0,
          file: expr.$document?.uri.fsPath ?? 'unknown',
        },
      },
    };
  }
}

/**
 * Internal evaluation function that throws on error
 */
function evaluateExpressionInternal(
  expr: Expression,
  constants: ConstantMap,
  evaluating: Set<string>
): JsonValue {
  switch (expr.$type) {
    // Literal values - already constant
    case 'StringLiteral':
      return (expr as StringLiteral).value;

    case 'NumberLiteral':
      return (expr as NumberLiteral).value;

    case 'BooleanLiteral':
      return (expr as BooleanLiteral).value;

    case 'NullLiteral':
      return null;

    // Array literal: [a, b, c] — constant only if every element is constant
    case 'ArrayLiteral': {
      const arr = expr as ArrayLiteral;
      return arr.elements.map(el => evaluateExpressionInternal(el, constants, evaluating));
    }

    // Object literal: { k: v } — constant only if every value is constant
    case 'ObjectLiteral': {
      const obj = expr as ObjectLiteral;
      const result: { [key: string]: JsonValue } = {};
      for (const prop of obj.properties) {
        result[prop.key] = evaluateExpressionInternal(prop.value, constants, evaluating);
      }
      return result;
    }

    // Binary expressions: a + b, a && b, etc.
    case 'BinaryExpression': {
      // Evaluate both operands before checking their types: when one side is a
      // runtime value, its (plain) error must win over an invalid-constant error
      // for the other side, whatever the operand order.
      const leftValue = evaluateExpressionInternal(expr.left, constants, evaluating);
      const rightValue = evaluateExpressionInternal(expr.right, constants, evaluating);
      if (NULLABLE_OPERATORS.has(expr.op)) {
        // Strict equality and truthiness are well defined for null.
        return applyNullableOperator(
          expr.op,
          assertPrimitiveOrNull(leftValue, expr.op),
          assertPrimitiveOrNull(rightValue, expr.op)
        );
      }
      return applyBinaryOperator(
        expr.op,
        assertPrimitive(leftValue, expr.op),
        assertPrimitive(rightValue, expr.op)
      );
    }

    // Unary expressions: !flag, -value
    case 'UnaryExpression': {
      const operand = evaluateExpressionInternal(expr.operand, constants, evaluating);
      // `!` is defined for every JSON value (`!null` → true, `![]` → false);
      // only `-` needs a primitive operand.
      if (expr.op === '!') {
        return !operand;
      }
      return applyUnaryOperator(expr.op, assertPrimitive(operand, expr.op));
    }

    // Variable reference: @varName
    case 'VariableReference': {
      const varRef = expr as VariableReference;
      if (!varRef.variable?.ref) {
        throw new Error('Undefined constant reference');
      }

      const varName = varRef.variable.ref.name;

      // Circular dependency detection
      if (evaluating.has(varName)) {
        throw new Error(`Circular dependency detected: ${varName}`);
      }

      // Check if this constant is in the map (for the declaration the
      // reference actually links to — a same-named constant may be shadowed)
      const constant = resolveConstant(varRef, constants);
      if (!constant) {
        throw new Error(`Undefined constant: ${varName}`);
      }

      return constant.value;
    }

    // Unsupported expression types
    default:
      throw new Error(`Cannot evaluate expression type: ${expr.$type}`);
  }
}

/**
 * Look up the constant a variable reference folds to, or `undefined` when the
 * reference is not a compile-time constant.
 *
 * Constant maps are keyed by name, but a name can be shadowed: an action-local
 * `const x = $operationdata.foo` (not foldable, so not in any map) shadows a
 * global `const x = 1` (in the program map). The reference links to the local
 * declaration, so it must not pick up the global's value. When the map entry
 * records its declaration, it only matches a reference that links to that
 * exact node; entries without one (hand-built maps) match by name.
 */
export function resolveConstant(
  varRef: VariableReference,
  ...constantMaps: ConstantMap[]
): ConstantValue | undefined {
  const declaration = varRef.variable?.ref;
  if (!declaration) {
    return undefined;
  }
  for (const constants of constantMaps) {
    const constant = constants.get(declaration.name);
    if (constant && (constant.declaration === undefined || constant.declaration === declaration)) {
      return constant;
    }
  }
  return undefined;
}

/**
 * Classify a folded constant value into a `ConstantValue['type']` tag.
 * `typeof` alone is wrong for arrays and null (both report differently than we
 * want), so this normalizes them.
 */
export function constantValueType(
  value: JsonValue
): 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'object';
}

/**
 * Thrown (and caught by {@link evaluateExpression}) when an expression is made
 * only of compile-time constants but is not a valid constant: division or
 * modulo by zero, an operand of the wrong type (`"abc" - 1`, `true + 1`), or
 * a result that is not a finite number. Unlike a non-constant expression, which
 * falls back to a runtime value, this is a compile error: there is no value to
 * emit (JSON has no NaN/Infinity; they serialize as `null`).
 */
class InvalidConstantExpression extends Error {}

/** Binary operators that require two numbers and produce a number. */
const NUMERIC_OPERATORS: ReadonlySet<string> = new Set(['-', '*', '/', '%', '**']);

/** Relational operators: two numbers or two strings. */
const RELATIONAL_OPERATORS: ReadonlySet<string> = new Set(['<', '>', '<=', '>=']);

/**
 * Arithmetic operators (`+` included). Eligius has no runtime arithmetic, so
 * these compile only when both operands are compile-time constants.
 */
export const ARITHMETIC_OPERATORS: ReadonlySet<string> = new Set(['+', ...NUMERIC_OPERATORS]);

/**
 * Message for an operator applied to a runtime value (parameter, variable,
 * system property, property chain) in a place where the compiler cannot emit it.
 *
 * Shared by the compiler (transformers/expression-transformer.ts) and the IDE
 * validator (validators/expression-validator.ts) so both use the same wording.
 * Comparisons and logical operators work on runtime values only inside if/when
 * conditions; arithmetic (and unary `-`) works nowhere at runtime.
 */
export function runtimeOperatorMessage(op: string, unary = false): string {
  const operands = 'runtime values (parameters, variables, system properties, property chains)';
  if (unary || ARITHMETIC_OPERATORS.has(op)) {
    return `Arithmetic operator '${op}' cannot be applied to ${operands}: Eligius has no runtime arithmetic in expressions. Use the calc operation instead (its result is $operationdata.calculationResult)`;
  }
  return `Operator '${op}' on ${operands} is only supported inside if/when conditions`;
}

/**
 * Narrow a JsonValue to a primitive for arithmetic and relational operators.
 * Arrays, objects and null cannot take part in these, so such an operand makes
 * the expression an invalid constant. (`==`, `!=`, `&&` and `||` also accept
 * null; see {@link assertPrimitiveOrNull}.)
 */
function assertPrimitive(value: JsonValue, op: string): string | number | boolean {
  if (value === null || typeof value === 'object') {
    throw new InvalidConstantExpression(
      `Operator '${op}' cannot be applied to a constant of type ${constantValueType(value)}`
    );
  }
  return value;
}

/** Operators that accept a null operand: strict equality and logical (truthiness). */
const NULLABLE_OPERATORS: ReadonlySet<string> = new Set(['==', '!=', '&&', '||']);

type PrimitiveOrNull = string | number | boolean | null;

/** Like {@link assertPrimitive}, but lets null through (arrays and objects still fail). */
function assertPrimitiveOrNull(value: JsonValue, op: string): PrimitiveOrNull {
  return value === null ? null : assertPrimitive(value, op);
}

/** Apply `==`, `!=`, `&&` or `||` to two primitive-or-null constants (no coercion). */
function applyNullableOperator(
  op: string,
  left: PrimitiveOrNull,
  right: PrimitiveOrNull
): PrimitiveOrNull {
  switch (op) {
    case '&&':
      return left && right;
    case '||':
      return left || right;
    case '==':
      return left === right;
    default:
      return left !== right;
  }
}

/** Reject NaN and ±Infinity: JSON cannot represent them (they serialize as null). */
function assertFinite(result: number, op: string): number {
  if (!Number.isFinite(result)) {
    throw new InvalidConstantExpression(
      `Constant expression with operator '${op}' does not produce a finite number (${result})`
    );
  }
  return result;
}

function operandTypeError(op: string, expected: string, left: unknown, right: unknown): never {
  throw new InvalidConstantExpression(
    `Operator '${op}' requires ${expected}, got ${typeof left} and ${typeof right}`
  );
}

/**
 * Apply a binary operator to two constant values.
 *
 * No JavaScript coercion: `"5" - 2`, `true + 1` and `"a" < 1` are invalid
 * instead of folding to a coerced (or NaN) value.
 */
function applyBinaryOperator(
  op: string,
  left: string | number | boolean,
  right: string | number | boolean
): string | number | boolean {
  if (NUMERIC_OPERATORS.has(op)) {
    if (typeof left !== 'number' || typeof right !== 'number') {
      return operandTypeError(op, 'numeric operands', left, right);
    }
    if ((op === '/' || op === '%') && right === 0) {
      throw new InvalidConstantExpression(
        `${op === '/' ? 'Division' : 'Modulo'} by zero in constant expression`
      );
    }
    return assertFinite(applyNumericOperator(op, left, right), op);
  }

  if (RELATIONAL_OPERATORS.has(op)) {
    const comparable =
      (typeof left === 'number' && typeof right === 'number') ||
      (typeof left === 'string' && typeof right === 'string');
    if (!comparable) {
      return operandTypeError(op, 'two numbers or two strings', left, right);
    }
    switch (op) {
      case '<':
        return left < right;
      case '>':
        return left > right;
      case '<=':
        return left <= right;
      default:
        return left >= right;
    }
  }

  switch (op) {
    case '+':
      // String concatenation when either side is a string
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left) + String(right);
      }
      if (typeof left !== 'number' || typeof right !== 'number') {
        return operandTypeError(op, 'numbers or a string', left, right);
      }
      return assertFinite(left + right, op);

    default:
      throw new Error(`Unsupported binary operator: ${op}`);
  }
}

function applyNumericOperator(op: string, left: number, right: number): number {
  switch (op) {
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return left / right;
    case '%':
      return left % right;
    default:
      return left ** right;
  }
}

/**
 * Apply a unary operator to a constant value
 */
function applyUnaryOperator(
  op: string,
  operand: string | number | boolean
): string | number | boolean {
  switch (op) {
    case '-':
      if (typeof operand !== 'number') {
        throw new InvalidConstantExpression(
          `Operator '-' requires a numeric operand, got ${typeof operand}`
        );
      }
      return -operand;

    default:
      throw new Error(`Unsupported unary operator: ${op}`);
  }
}
