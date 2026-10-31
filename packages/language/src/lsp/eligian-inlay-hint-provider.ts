/**
 * Parameter-name inlay hints for operation and action calls (audit feature idea #7).
 *
 *   broadcastEvent(eventArgs: ["#panel"], eventName: "tour-ping")
 *
 * Setting `eligian.inlayHints.parameterNames`:
 * - `literals` (default): before literal arguments (strings, numbers, booleans,
 *   null, arrays, objects), where the meaning is not visible from the argument
 * - `all`: before every argument, except a parameter reference that already
 *   has the parameter's name (`fadeIn(selector)` for `selector`)
 * - `none`: off
 */
import { type AstNode, AstUtils, type CommentProvider } from 'langium';
import { AbstractInlayHintProvider, type InlayHintAcceptor } from 'langium/lsp';
import { InlayHintKind } from 'vscode-languageserver';
import type { EligianServices } from '../eligian-module.js';
import { type Expression, isOperationCall, isParameterReference } from '../generated/ast.js';
import { getCallSignature } from './call-signature.js';

export type ParameterNameHints = 'none' | 'literals' | 'all';

const MODES: readonly ParameterNameHints[] = ['none', 'literals', 'all'];

const LITERAL_TYPES = new Set([
  'StringLiteral',
  'NumberLiteral',
  'BooleanLiteral',
  'NullLiteral',
  'ArrayLiteral',
  'ObjectLiteral',
]);

/** A literal, or a negated number literal (`-5`). */
function isLiteral(expr: Expression): boolean {
  if (LITERAL_TYPES.has(expr.$type)) return true;
  return (
    expr.$type === 'UnaryExpression' && expr.op === '-' && expr.operand?.$type === 'NumberLiteral'
  );
}

export class EligianInlayHintProvider extends AbstractInlayHintProvider {
  private readonly comments: CommentProvider;
  private mode: ParameterNameHints = 'literals';

  constructor(services: EligianServices) {
    super();
    this.comments = services.documentation.CommentProvider;

    // The configuration is only available once the client has initialized
    // (getConfiguration waits for that), so read it then and on every change.
    const configuration = services.shared.workspace.ConfigurationProvider;
    const ready = (configuration as { ready?: Promise<void> }).ready;
    ready
      ?.then(() => configuration.getConfiguration('eligian', 'inlayHints'))
      .then(settings => this.setParameterNameHints(settings?.parameterNames))
      .catch(() => {});
    configuration.onConfigurationSectionUpdate(update => {
      if (update.section === 'eligian') {
        this.setParameterNameHints(update.configuration?.inlayHints?.parameterNames);
      }
    });
  }

  /** Apply the `eligian.inlayHints.parameterNames` setting (unknown values keep the default). */
  setParameterNameHints(mode: unknown): void {
    this.mode = MODES.includes(mode as ParameterNameHints)
      ? (mode as ParameterNameHints)
      : 'literals';
  }

  override computeInlayHint(node: AstNode, acceptor: InlayHintAcceptor): void {
    if (this.mode === 'none' || !isOperationCall(node)) return;
    const signature = getCallSignature(node, this.comments);
    if (!signature) return;
    const textDocument = AstUtils.getDocument(node).textDocument;

    node.args.forEach((arg, index) => {
      const parameter = signature.parameters[index];
      const cst = arg.$cstNode;
      if (!parameter || !cst) return;
      // The controller name says what it is
      if (signature.kind === 'controller' && index === 0) return;
      if (this.mode === 'literals' && !isLiteral(arg)) return;
      if (isParameterReference(arg) && arg.parameter?.$refText === parameter.name) return;
      acceptor({
        position: textDocument.positionAt(cst.offset),
        label: `${parameter.name}:`,
        kind: InlayHintKind.Parameter,
        paddingRight: true,
      });
    });
  }
}
