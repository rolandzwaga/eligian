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
  BooleanLiteral,
  Expression,
  NumberLiteral,
  StringLiteral,
  VariableReference,
} from '../generated/ast.js';
import type { ConstantMap, ExpressionEvaluationResult } from './types/constant-folding.js';

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
): string | number | boolean {
  switch (expr.$type) {
    // Literal values - already constant
    case 'StringLiteral':
      return (expr as StringLiteral).value;

    case 'NumberLiteral':
      return (expr as NumberLiteral).value;

    case 'BooleanLiteral':
      return (expr as BooleanLiteral).value;

    // Binary expressions: a + b, a && b, etc.
    case 'BinaryExpression': {
      const left = evaluateExpressionInternal(expr.left, constants, evaluating);
      const right = evaluateExpressionInternal(expr.right, constants, evaluating);
      return applyBinaryOperator(expr.op, left, right);
    }

    // Unary expressions: !flag, -value
    case 'UnaryExpression': {
      const operand = evaluateExpressionInternal(expr.operand, constants, evaluating);
      return applyUnaryOperator(expr.op, operand);
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

      // Check if this constant is in the map
      if (!constants.has(varName)) {
        throw new Error(`Undefined constant: ${varName}`);
      }

      const constant = constants.get(varName)!;
      return constant.value;
    }

    // Unsupported expression types
    default:
      throw new Error(`Cannot evaluate expression type: ${expr.$type}`);
  }
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
      return Boolean(left) && Boolean(right);

    case '||':
      return Boolean(left) || Boolean(right);

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
    case '!':
      return !operand;

    case '-':
      return -(operand as number);

    default:
      throw new Error(`Unsupported unary operator: ${op}`);
  }
}
