/**
 * Runtime string concatenation (`"#" + slideId`): shared AST classification.
 *
 * Eligius has no expression evaluation in operation arguments: a property chain
 * (`$operationdata.slideId`) is only resolved as a whole string, and only by the
 * operations that resolve their own inputs. A `+` over a runtime value therefore
 * has no JSON form. String concatenation is the exception: the compiler lowers it
 * to Eligius's `concatenateStrings` operation (see transformers/runtime-values.ts).
 *
 * This module decides, purely from the AST, which `+` expressions are such a
 * concatenation and where one may appear. The compiler (expression-transformer.ts)
 * and the IDE validator (validators/expression-validator.ts) both use it, so they
 * accept and reject the same programs.
 */
import type { AstNode } from 'langium';
import {
  type BinaryExpression,
  type Expression,
  isBinaryExpression,
  isExpression,
  isObjectProperty,
  isOperationCall,
  isProgram,
  isVariableDeclaration,
  type VariableDeclaration,
} from '../generated/ast.js';

/** Reported for a runtime concatenation outside the places the compiler can lower it. */
export const RUNTIME_CONCAT_CONTEXT_MESSAGE =
  'String concatenation with runtime values (parameters, variables, system properties, property chains) is only supported in operation arguments, action call arguments and action-level const declarations';

/** Reported for an object or array operand of a runtime concatenation. */
export const RUNTIME_CONCAT_OPERAND_MESSAGE =
  'Objects and arrays cannot be part of a string concatenation';

/**
 * True when `expr` is statically a string, so that `+` with it concatenates (as in
 * JavaScript, where `+` concatenates when either operand is a string):
 * - a string literal
 * - a parameter annotated `: string`
 * - a reference to a `const` whose initializer is string-typed
 * - a `+` with a string-typed operand
 *
 * Property chains, system properties and unannotated parameters have no static
 * type, so `a + b` over those is arithmetic (and a compile error), never a
 * concatenation: Eligius would join `1` and `2` into `"12"`.
 */
export function isStringTyped(
  expr: Expression | undefined,
  visiting: Set<VariableDeclaration> = new Set()
): boolean {
  if (!expr) return false;
  switch (expr.$type) {
    case 'StringLiteral':
      return true;
    case 'ParameterReference':
      return expr.parameter?.ref?.type === 'string';
    case 'VariableReference': {
      const declaration = expr.variable?.ref;
      if (!isVariableDeclaration(declaration) || visiting.has(declaration)) return false;
      visiting.add(declaration);
      const result = isStringTyped(declaration.value, visiting);
      visiting.delete(declaration);
      return result;
    }
    case 'BinaryExpression':
      return (
        expr.op === '+' &&
        (isStringTyped(expr.left, visiting) || isStringTyped(expr.right, visiting))
      );
    default:
      return false;
  }
}

/** True when `expr` is a `+` that concatenates strings (see {@link isStringTyped}). */
export function isConcatenation(expr: AstNode | undefined): expr is BinaryExpression {
  return isBinaryExpression(expr) && expr.op === '+' && isStringTyped(expr);
}

/**
 * The operands of the concatenation rooted at `expr`, left to right, with nested
 * concatenations flattened: `"#" + a + "-" + b` gives `["#", a, "-", b]`.
 *
 * A non-string `+` inside a concatenation stays one operand, matching JavaScript's
 * left-to-right evaluation: in `(1 + x) + "s"` the `1 + x` is an addition.
 * Returns undefined when `expr` is not a concatenation.
 */
export function getConcatOperands(expr: Expression): Expression[] | undefined {
  if (!isConcatenation(expr)) return undefined;
  const operands: Expression[] = [];
  const flatten = (e: Expression): void => {
    if (isConcatenation(e)) {
      flatten(e.left);
      flatten(e.right);
    } else {
      operands.push(e);
    }
  };
  flatten(expr);
  return operands;
}

/**
 * True when `expr` is the outermost node of a concatenation chain. Inner chain
 * nodes are flattened into their root, so the compiler only ever sees (and
 * reports on) the root.
 */
export function isConcatRoot(expr: AstNode): expr is BinaryExpression {
  return isConcatenation(expr) && !isConcatenation(expr.$container);
}

/**
 * True when a concatenation at `node` can be lowered by the compiler: inside the
 * arguments of an operation or action call (at any depth of object and array
 * literals), or as the value of an action-level `const`.
 *
 * Everything else has no place to put the extra operations: `if` conditions
 * (serialized to a `when` expression), `for` collections, time expressions and
 * program-level constants (emitted as global data).
 */
export function isInConcatContext(node: AstNode): boolean {
  let child: AstNode = node;
  let parent = node.$container;
  while (parent && (isExpression(parent) || isObjectProperty(parent))) {
    child = parent;
    parent = parent.$container;
  }
  if (isOperationCall(parent)) return child.$containerProperty === 'args';
  if (isVariableDeclaration(parent)) {
    return child.$containerProperty === 'value' && !isProgram(parent.$container);
  }
  return false;
}
