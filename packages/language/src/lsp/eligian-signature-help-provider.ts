/**
 * Signature help for operation and action calls (audit feature idea #7).
 *
 * Typing `(` or `,` in a call shows the callee's parameters, with the one being
 * typed highlighted: its name, type, whether it is optional, and its
 * description from the operation metadata or the action's JSDoc `@param`.
 */
import {
  AstUtils,
  type CommentProvider,
  CstUtils,
  GrammarUtils,
  type LangiumDocument,
  type MaybePromise,
} from 'langium';
import { AbstractSignatureHelpProvider } from 'langium/lsp';
import type { MarkupContent, SignatureHelp, SignatureHelpParams } from 'vscode-languageserver';
import type { EligianServices } from '../eligian-module.js';
import { isOperationCall, type OperationCall } from '../generated/ast.js';
import { type CallSignature, formatSignature, getCallSignature } from './call-signature.js';

/** The call whose parentheses contain `offset`, and the index of the argument there. */
export function findActiveCall(
  document: LangiumDocument,
  offset: number
): { call: OperationCall; activeParameter: number } | undefined {
  const root = document.parseResult.value.$cstNode;
  if (!root) return undefined;
  const leaf =
    CstUtils.findLeafNodeBeforeOffset(root, offset) ?? CstUtils.findLeafNodeAtOffset(root, offset);
  const call = leaf && AstUtils.getContainerOfType(leaf.astNode, isOperationCall);
  const cst = call?.$cstNode;
  if (!call || !cst) return undefined;

  const open = GrammarUtils.findNodeForKeyword(cst, '(');
  const close = GrammarUtils.findNodeForKeyword(cst, ')');
  if (!open || offset < open.end || (close && offset >= close.end)) return undefined;

  // Commas of this call only: those inside array/object arguments belong to those literals
  const activeParameter = GrammarUtils.findNodesForKeyword(cst, ',').filter(
    comma => comma.end <= offset
  ).length;
  return { call, activeParameter };
}

function markdown(value: string): MarkupContent {
  return { kind: 'markdown', value };
}

/** LSP SignatureHelp for `signature` with `activeParameter` highlighted. */
export function toSignatureHelp(signature: CallSignature, activeParameter: number): SignatureHelp {
  const { label, parameterRanges } = formatSignature(signature);
  return {
    signatures: [
      {
        label,
        documentation: signature.documentation ? markdown(signature.documentation) : undefined,
        parameters: signature.parameters.map((parameter, index) => ({
          label: parameterRanges[index],
          documentation: markdown(
            [
              `\`${parameter.name}\`${parameter.optional ? ' (optional)' : ''}`,
              parameter.description,
            ]
              .filter(Boolean)
              .join(' — ')
          ),
        })),
      },
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParameter, Math.max(0, signature.parameters.length - 1)),
  };
}

export class EligianSignatureHelpProvider extends AbstractSignatureHelpProvider {
  private readonly comments: CommentProvider;

  constructor(services: EligianServices) {
    super();
    this.comments = services.documentation.CommentProvider;
  }

  override provideSignatureHelp(
    document: LangiumDocument,
    params: SignatureHelpParams
  ): MaybePromise<SignatureHelp | undefined> {
    const active = findActiveCall(document, document.textDocument.offsetAt(params.position));
    if (!active) return undefined;
    const signature = getCallSignature(active.call, this.comments);
    return signature ? toSignatureHelp(signature, active.activeParameter) : undefined;
  }

  // The base class looks up the element itself; provideSignatureHelp is overridden instead
  protected override getSignatureFromElement(): MaybePromise<SignatureHelp | undefined> {
    return undefined;
  }
}
