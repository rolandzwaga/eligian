import { type AstNode, AstUtils, type ValidationAcceptor } from 'langium';
import {
  type Expression,
  isExpression,
  isIfStatement,
  isObjectProperty,
  isUnaryExpression,
  isVariableDeclaration,
  type UnaryExpression,
  type VariableDeclaration,
} from '../generated/ast.js';
import { BaseValidator } from './base-validator.js';

/** Diagnostic code for `!` applied to a runtime value outside an `if` condition. */
export const RUNTIME_NEGATION_CODE = 'runtime_negation_outside_condition';

/**
 * Same wording as the compiler's TransformError
 * (compiler/transformers/expression-transformer.ts, `'!'` case).
 */
export const RUNTIME_NEGATION_MESSAGE =
  'Negation of runtime values (parameters, variables, system properties) is only supported inside if/when conditions';

/**
 * Compile-time classification of an expression:
 * - `constant`: folds at compile time (literals, constant references, operators over those)
 * - `runtime`: definitely depends on a runtime value (parameter, system property, property chain)
 * - `unknown`: cannot tell (unresolved reference, cycle, non-const declaration target)
 */
type Constness = 'constant' | 'runtime' | 'unknown';

/**
 * Validates expressions for constructs the compiler cannot emit.
 */
export class ExpressionValidator extends BaseValidator {
  /**
   * Unary `!` folds only compile-time constants. Eligius has no runtime negation outside
   * `when` expressions, so the compiler rejects `!` on a runtime operand unless the expression
   * sits inside an `if` condition (serialized to a `when` expression string).
   *
   * Only the innermost offending `!` is reported (`!!flag` yields one diagnostic), and an
   * operand whose constness cannot be determined is not reported.
   */
  checkRuntimeNegation(node: UnaryExpression, accept: ValidationAcceptor): void {
    if (node.op !== '!' || !node.operand) return;
    if (classifyConstness(node.operand) !== 'runtime') return;
    if (isInsideIfCondition(node)) return;
    if (containsRuntimeNegation(node.operand)) return;

    accept('error', RUNTIME_NEGATION_MESSAGE, {
      node,
      data: { code: RUNTIME_NEGATION_CODE },
    });
  }
}

/**
 * Mirrors the compiler's constant evaluator (compiler/expression-evaluator.ts): a reference to
 * a `const` is constant when its initializer is. Where the compiler might still refuse to fold
 * a "constant" (e.g. division by zero, a global referencing a later global), this reports
 * `constant` — erring towards no diagnostic.
 */
function classifyConstness(
  expr: Expression | undefined,
  visiting: Set<VariableDeclaration> = new Set()
): Constness {
  if (!expr) return 'unknown';
  switch (expr.$type) {
    case 'StringLiteral':
    case 'NumberLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
      return 'constant';
    case 'ParameterReference':
      // An unresolved parameter already has a linking error; do not pile on.
      return expr.parameter?.ref ? 'runtime' : 'unknown';
    case 'SystemPropertyReference':
    case 'PropertyChainReference':
      return 'runtime';
    case 'VariableReference': {
      const declaration = expr.variable?.ref;
      if (!isVariableDeclaration(declaration) || visiting.has(declaration)) return 'unknown';
      visiting.add(declaration);
      const result = classifyConstness(declaration.value, visiting);
      visiting.delete(declaration);
      return result;
    }
    case 'UnaryExpression':
      return classifyConstness(expr.operand, visiting);
    case 'BinaryExpression':
      return combine([expr.left, expr.right], visiting);
    case 'ArrayLiteral':
      return combine(expr.elements, visiting);
    case 'ObjectLiteral':
      return combine(
        expr.properties.map(p => p.value),
        visiting
      );
    default:
      return 'unknown';
  }
}

/** Any runtime part makes the whole runtime (the evaluator fails on it); otherwise unknown wins. */
function combine(exprs: Expression[], visiting: Set<VariableDeclaration>): Constness {
  let result: Constness = 'constant';
  for (const expr of exprs) {
    const part = classifyConstness(expr, visiting);
    if (part === 'runtime') return 'runtime';
    if (part === 'unknown') result = 'unknown';
  }
  return result;
}

/** True when `node` is (transitively, through expressions only) an `if` condition. */
function isInsideIfCondition(node: AstNode): boolean {
  let child: AstNode = node;
  let parent = node.$container;
  while (parent) {
    if (isIfStatement(parent)) return child.$containerProperty === 'condition';
    if (!isExpression(parent) && !isObjectProperty(parent)) return false;
    child = parent;
    parent = parent.$container;
  }
  return false;
}

/** True when a nested `!` inside `expr` is itself reported, so the outer one stays silent. */
function containsRuntimeNegation(expr: Expression): boolean {
  return AstUtils.streamAst(expr).some(
    n => isUnaryExpression(n) && n.op === '!' && classifyConstness(n.operand) === 'runtime'
  );
}
