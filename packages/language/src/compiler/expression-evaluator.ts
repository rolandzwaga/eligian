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
      const left = assertPrimitive(evaluateExpressionInternal(expr.left, constants, evaluating));
      const right = assertPrimitive(evaluateExpressionInternal(expr.right, constants, evaluating));
      return applyBinaryOperator(expr.op, left, right);
    }

    // Unary expressions: !flag, -value
    case 'UnaryExpression': {
      const operand = evaluateExpressionInternal(expr.operand, constants, evaluating);
      // `!` is defined for every JSON value (`!null` → true, `![]` → false);
      // only `-` needs a primitive operand.
      if (expr.op === '!') {
        return !operand;
      }
      return applyUnaryOperator(expr.op, assertPrimitive(operand));
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
 * Narrow a JsonValue to a primitive for arithmetic/logical/comparison operators.
 * Arrays/objects/null can't participate in these, so a non-primitive operand
 * makes the whole expression non-constant (caught → canEvaluate: false).
 */
function assertPrimitive(value: JsonValue): string | number | boolean {
  if (value === null || typeof value === 'object') {
    throw new Error('Operator operand is not a primitive value');
  }
  return value;
}

/**
 * Apply a binary operator to two values
 */
function applyBinaryOperator(
  op: string,
  left: string | number | boolean,
  right: string | number | boolean
): string | number | boolean {
  switch (op) {
    // Arithmetic operators
    case '+':
      // Special case: string concatenation
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left) + String(right);
      }
      return (left as number) + (right as number);

    case '-':
      return (left as number) - (right as number);

    case '*':
      return (left as number) * (right as number);

    case '/': {
      if ((right as number) === 0) {
        throw new Error('Division by zero in constant expression');
      }
      return (left as number) / (right as number);
    }

    case '%':
      return (left as number) % (right as number);

    // Logical operators
    case '&&':
      return left && right;

    case '||':
      return left || right;

    // Comparison operators
    case '==':
      return left === right;

    case '!=':
      return left !== right;

    case '<':
      return (left as number) < (right as number);

    case '>':
      return (left as number) > (right as number);

    case '<=':
      return (left as number) <= (right as number);

    case '>=':
      return (left as number) >= (right as number);

    default:
      throw new Error(`Unsupported binary operator: ${op}`);
  }
}

/**
 * Apply a unary operator to a value
 */
function applyUnaryOperator(
  op: string,
  operand: string | number | boolean
): string | number | boolean {
  switch (op) {
    case '-':
      return -(operand as number);

    default:
      throw new Error(`Unsupported unary operator: ${op}`);
  }
}
