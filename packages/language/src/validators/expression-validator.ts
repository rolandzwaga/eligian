import { type AstNode, AstUtils, type ValidationAcceptor } from 'langium';
import {
  ARITHMETIC_OPERATORS,
  constantValueType,
  evaluateExpression,
  runtimeOperatorMessage,
} from '../compiler/expression-evaluator.js';
import {
  getConcatOperands,
  isConcatenation,
  isConcatRoot,
  isInConcatContext,
  RUNTIME_CONCAT_CONTEXT_MESSAGE,
  RUNTIME_CONCAT_OPERAND_MESSAGE,
} from '../compiler/runtime-concat.js';
import type { ConstantMap } from '../compiler/types/constant-folding.js';
import {
  type BinaryExpression,
  type Expression,
  isBinaryExpression,
  isExpression,
  isIfStatement,
  isObjectProperty,
  isUnaryExpression,
  isVariableDeclaration,
  isVariableReference,
  type UnaryExpression,
  type VariableDeclaration,
  type VariableReference,
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
 * Diagnostic code for an operator the compiler cannot emit because an operand is a runtime value:
 * arithmetic (`x + 10`, `-x`) anywhere, comparisons/logic (`x > 5`) outside an `if` condition.
 * The message is {@link runtimeOperatorMessage}, shared with the compiler.
 */
export const RUNTIME_OPERATOR_CODE = 'runtime_operator_operand';

/**
 * Diagnostic code for an all-constant expression that has no valid value (`10 % 0`, `"abc" - 1`,
 * `true + 1`, a non-finite result). The message is the constant evaluator's reason, which the
 * compiler reports too.
 */
export const INVALID_CONSTANT_CODE = 'invalid_constant_expression';

/**
 * Diagnostic codes for runtime string concatenation (`"#" + id`, compiler/runtime-concat.ts):
 * used outside operation/action-call arguments and action-level consts, or with an object or
 * array operand.
 */
export const RUNTIME_CONCAT_CONTEXT_CODE = 'runtime_concat_context';
export const RUNTIME_CONCAT_OPERAND_CODE = 'runtime_concat_operand';

/**
 * Diagnostic code for a reference, in the end block of an endable action or inline stagger
 * block, to a runtime (non-foldable) const of the start block.
 */
export const END_BLOCK_RUNTIME_CONST_CODE = 'end_block_runtime_const';

/** End-block property → start-block property of the same node (see eligian-scope-provider.ts). */
const START_LIST_OF_END_LIST: Readonly<Record<string, string>> = {
  endOperations: 'startOperations',
  endOps: 'startOps',
};

/**
 * Compile-time classification of an expression:
 * - `constant`: folds at compile time (literals, constant references, operators over those)
 * - `runtime`: definitely depends on a runtime value (parameter, system property, property chain)
 * - `unknown`: cannot tell (unresolved reference, cycle, non-const declaration target)
 */
type Constness = 'constant' | 'runtime' | 'unknown';

type OperatorExpression = BinaryExpression | UnaryExpression;

interface Problem {
  message: string;
  code: string;
  /** Node to report on, when not the operator expression itself. */
  node?: AstNode;
}

/**
 * Validates expressions for constructs the compiler cannot emit.
 */
export class ExpressionValidator extends BaseValidator {
  /**
   * Reports operator expressions the compiler rejects (expression-transformer.ts):
   * - `!` on a runtime operand outside an `if` condition (Eligius has no runtime negation outside
   *   `when` expressions)
   * - arithmetic or unary `-` on a runtime operand (Eligius has no runtime arithmetic; the
   *   compiler used to emit an inert `("$operationdata.x" + 10)` string)
   * - a comparison or logical operator on a runtime operand outside an `if` condition
   * - an all-constant operation with no valid value (`10 % 0`, `"abc" - 1`)
   *
   * Like the compiler, which transforms operands first, only the innermost offending expression
   * is reported (`!!flag` and `x + 1 + 2` yield one diagnostic each), and an operand whose
   * constness cannot be determined is not reported.
   */
  checkOperatorExpression(node: OperatorExpression, accept: ValidationAcceptor): void {
    const problem = operatorProblem(node);
    if (!problem) return;
    if (operandsOf(node).some(hasProblemWithin)) return;

    accept('error', problem.message, {
      node: problem.node ?? node,
      data: { code: problem.code },
    });
  }

  /**
   * End blocks see the consts of their start block (the compiler transforms both with one scope
   * and inlines foldable consts). A const whose value depends on a runtime value is emitted as a
   * `setVariable` in the start operations instead, and Eligius does not carry it over to the end
   * operations, so referencing it from the end block is an error.
   */
  checkEndBlockConstReference(node: VariableReference, accept: ValidationAcceptor): void {
    const declaration = node.variable?.ref;
    if (!isVariableDeclaration(declaration)) return;
    const owner = declaration.$container;
    const startProperty = declaration.$containerProperty;
    if (!owner || !Object.values(START_LIST_OF_END_LIST).includes(startProperty ?? '')) return;

    // The statement of `owner` that holds the reference must sit in the end list.
    let child: AstNode = node;
    while (child.$container && child.$container !== owner) {
      child = child.$container;
    }
    if (child.$container !== owner) return;
    const endProperty = child.$containerProperty ?? '';
    if (START_LIST_OF_END_LIST[endProperty] !== startProperty) return;

    if (classifyConstness(declaration.value) !== 'runtime') return;
    accept(
      'error',
      `'${declaration.name}' is declared in the start block from a runtime value, so it is not available in the end block: Eligius runs the end operations without the start operations' variables. Only compile-time constants of the start block can be used here.`,
      { node, data: { code: END_BLOCK_RUNTIME_CONST_CODE } }
    );
  }
}

function operandsOf(node: OperatorExpression): Expression[] {
  return (isBinaryExpression(node) ? [node.left, node.right] : [node.operand]).filter(
    (e): e is Expression => e !== undefined
  );
}

/** True when `expr` or an operator expression nested in it has a problem of its own. */
function hasProblemWithin(expr: Expression): boolean {
  return AstUtils.streamAst(expr).some(
    n => (isBinaryExpression(n) || isUnaryExpression(n)) && operatorProblem(n) !== undefined
  );
}

/** The problem with this operator expression itself, ignoring problems in its operands. */
function operatorProblem(node: OperatorExpression): Problem | undefined {
  const operands = operandsOf(node);
  if (operands.length !== (isBinaryExpression(node) ? 2 : 1)) return undefined;

  const constness = combine(operands, new Set());
  if (constness === 'runtime' && isConcatenation(node)) {
    return concatenationProblem(node);
  }
  if (constness === 'runtime') {
    if (isUnaryExpression(node) && node.op === '!') {
      return isInsideIfCondition(node)
        ? undefined
        : { message: RUNTIME_NEGATION_MESSAGE, code: RUNTIME_NEGATION_CODE };
    }
    const unary = isUnaryExpression(node);
    // Conditions serialize comparisons and logic over runtime values, never arithmetic.
    if (unary || ARITHMETIC_OPERATORS.has(node.op) || !isInsideIfCondition(node)) {
      return { message: runtimeOperatorMessage(node.op, unary), code: RUNTIME_OPERATOR_CODE };
    }
    return undefined;
  }

  if (constness === 'constant') {
    const reason = invalidConstantReason(node, operands);
    return reason ? { message: reason, code: INVALID_CONSTANT_CODE } : undefined;
  }
  return undefined;
}

/**
 * A runtime string concatenation is lowered by the compiler (transformers/runtime-values.ts),
 * so it is valid where the compiler can place the extra operations. Like the compiler, which
 * flattens a concatenation chain into its outermost `+`, only the root of a chain is checked.
 */
function concatenationProblem(node: BinaryExpression): Problem | undefined {
  if (!isConcatRoot(node)) return undefined;
  for (const operand of getConcatOperands(node) ?? []) {
    if (isObjectOrArray(operand)) {
      return {
        message: RUNTIME_CONCAT_OPERAND_MESSAGE,
        code: RUNTIME_CONCAT_OPERAND_CODE,
        node: operand,
      };
    }
  }
  if (!isInConcatContext(node)) {
    return { message: RUNTIME_CONCAT_CONTEXT_MESSAGE, code: RUNTIME_CONCAT_CONTEXT_CODE };
  }
  return undefined;
}

/** An object/array literal, or a constant whose value is one. */
function isObjectOrArray(expr: Expression): boolean {
  if (expr.$type === 'ObjectLiteral' || expr.$type === 'ArrayLiteral') return true;
  const result = evaluateExpression(expr, constantsReferencedBy(expr, new Set()));
  return result.canEvaluate && result.value !== null && typeof result.value === 'object';
}

/**
 * The constant evaluator's reason when `node` itself is an invalid constant. Operands that do not
 * evaluate (invalid themselves, or not foldable) are left to their own diagnostic / the compiler.
 */
function invalidConstantReason(
  node: OperatorExpression,
  operands: Expression[]
): string | undefined {
  const constants = constantsReferencedBy(node, new Set());
  if (!operands.every(operand => evaluateExpression(operand, constants).canEvaluate)) {
    return undefined;
  }
  const result = evaluateExpression(node, constants);
  return result.error?.invalid ? result.error.reason : undefined;
}

/**
 * Constant values of the `const` declarations `expr` references (transitively), keyed and
 * matched by declaration like the compiler's constant map.
 */
function constantsReferencedBy(expr: Expression, visiting: Set<VariableDeclaration>): ConstantMap {
  const constants: ConstantMap = new Map();
  for (const node of AstUtils.streamAst(expr)) {
    if (!isVariableReference(node)) continue;
    const declaration = node.variable?.ref;
    if (!isVariableDeclaration(declaration) || visiting.has(declaration)) continue;
    if (constants.get(declaration.name)?.declaration === declaration) continue;
    visiting.add(declaration);
    const result = evaluateExpression(
      declaration.value,
      constantsReferencedBy(declaration.value, visiting)
    );
    visiting.delete(declaration);
    if (result.canEvaluate) {
      const value = result.value ?? null;
      constants.set(declaration.name, {
        name: declaration.name,
        value,
        type: constantValueType(value),
        declaration,
      });
    }
  }
  return constants;
}

/**
 * Mirrors the compiler's constant evaluator (compiler/expression-evaluator.ts): a reference to
 * a `const` is constant when its initializer is. Where the compiler might still refuse to fold
 * a "constant" (e.g. a global referencing a later global), this reports `constant` — erring
 * towards no diagnostic.
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
