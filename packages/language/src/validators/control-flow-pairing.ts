import type { AstNode, Properties, ValidationAcceptor } from 'langium';
import { validateControlFlowPairing } from '../compiler/index.js';
import type { OperationCall, OperationStatement } from '../generated/ast.js';
import { formatValidationMessage } from '../utils/error-builder.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';

/**
 * Check raw `when`/`endWhen`/`otherwise` and `forEach`/`endForEach` pairing in an
 * operation list AND in every nested `if`/`else` branch and `for` body.
 *
 * Each `if` compiles to its own balanced `when ... endWhen` wrapper and each `for`
 * to its own `forEach ... endForEach` wrapper, so every nested list must balance
 * on its own: pairing never spans a block boundary. Errors for the top-level list
 * are reported on `node.property`; errors for a nested list are reported on the
 * nested statement's own branch/body property so they point at the offending block.
 */
export function reportControlFlowPairing<N extends AstNode>(
  operations: readonly OperationStatement[] | undefined,
  node: N,
  property: Properties<N>,
  accept: ValidationAcceptor
): void {
  checkList(operations ?? [], node, property as string, accept);
}

function checkList(
  operations: readonly OperationStatement[],
  node: AstNode,
  property: string,
  accept: ValidationAcceptor
): void {
  const operationNames = operations
    .filter((op): op is OperationCall => op.$type === 'OperationCall')
    .map(op => getOperationCallName(op))
    .filter((name): name is string => name !== undefined);

  for (const error of validateControlFlowPairing(operationNames)) {
    accept('error', formatValidationMessage(error.message, error.hint), {
      node,
      property,
      code: error.code.toLowerCase(),
    });
  }

  for (const statement of operations) {
    if (statement.$type === 'IfStatement') {
      checkList(statement.thenOps, statement, 'thenOps', accept);
      checkList(statement.elseOps, statement, 'elseOps', accept);
    } else if (statement.$type === 'ForStatement') {
      checkList(statement.body, statement, 'body', accept);
    }
  }
}
