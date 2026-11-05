/**
 * Quick fix 'Insert selectElement(…)' (audit feature idea #17) for an
 * operation (or action call) that needs `selectedElement` while nothing is
 * selected yet: inserts a selectElement call right before it. For an action
 * called directly as an `at` event (`at 0s..1s show("#a")`) it offers
 * 'Add target "…"' instead, with the argument the action selects.
 *
 * The selector is guessed, nearest first: a `selectElement` of the sibling
 * block of the same event or endable action (start ↔ end), an earlier one in
 * the same block, a selector-like parameter of the enclosing action (`sel`,
 * `selector`, `target`, `element`), else an empty string to fill in.
 */
import { type AstNode, AstUtils, CstUtils, type LangiumDocument } from 'langium';
import {
  type CodeAction,
  CodeActionKind,
  type Diagnostic,
  type Range,
} from 'vscode-languageserver-protocol';
import {
  isActionDefinition,
  isEndableActionDefinition,
  isInlineEndableAction,
  isOperationCall,
  isStringLiteral,
  isTimedEvent,
  type OperationCall,
  type OperationStatement,
} from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';

const DEPENDENCY_CODES = new Set(['missing-dependency', 'missing-action-dependency']);
const SELECTOR_PARAMETER = /^(sel|selector|target|element|el)$/i;

/** The first string argument of the `selectElement` calls in `statements`, last first. */
function selectorsIn(statements: readonly OperationStatement[]): string[] {
  return statements
    .flatMap(statement => [statement, ...AstUtils.streamAllContents(statement)])
    .filter(isOperationCall)
    .filter(call => getOperationCallName(call) === 'selectElement')
    .map(call => call.args[0])
    .filter(isStringLiteral)
    .map(arg => JSON.stringify(arg.value))
    .reverse();
}

/** The selector expression to insert for `call` (source text, quoted when a string). */
export function guessSelector(call: OperationCall): string {
  // The start/end block pair the call is in (inline event or endable action)
  const owner = AstUtils.getContainerOfType(
    call,
    (node): node is AstNode => isInlineEndableAction(node) || isEndableActionDefinition(node)
  );
  if (owner && (isInlineEndableAction(owner) || isEndableActionDefinition(owner))) {
    const inStart = owner.startOperations.some(
      statement => statement === call || AstUtils.streamAllContents(statement).some(n => n === call)
    );
    const sibling = selectorsIn(inStart ? owner.endOperations : owner.startOperations);
    if (sibling.length > 0) return sibling[0];
  }

  // An earlier selectElement in the same operation list
  const container = call.$container;
  const list = (container as unknown as Record<string, unknown>)[call.$containerProperty ?? ''];
  if (Array.isArray(list)) {
    const before = selectorsIn(list.slice(0, list.indexOf(call)) as OperationStatement[]);
    if (before.length > 0) return before[0];
  }

  // A selector-like parameter of the enclosing action
  const action = AstUtils.getContainerOfType(call, isActionDefinition);
  const parameter = action?.parameters.find(p => SELECTOR_PARAMETER.test(p.name));
  if (parameter) return parameter.name;
  return '""';
}

/**
 * The selector for `target` of a timeline-level action call: the string
 * argument passed to the action's selector-like parameter, else its first
 * string argument, else an empty string to fill in.
 */
function targetFor(call: OperationCall): string {
  const action = call.operationName?.ref;
  const index = isActionDefinition(action)
    ? action.parameters.findIndex(p => SELECTOR_PARAMETER.test(p.name))
    : -1;
  const candidate = index >= 0 ? call.args[index] : call.args.find(isStringLiteral);
  return isStringLiteral(candidate) ? JSON.stringify(candidate.value) : '""';
}

/** The edit of the 'Insert selectElement(…)' / 'Add target …' quick fix. */
export interface SelectElementFix {
  /** `Insert selectElement(…)` or `Add target …` */
  readonly title: string;
  /** LSP, 0-based; an insertion (start = end) */
  readonly range: Range;
  readonly newText: string;
}

/** The edit of the 'Insert selectElement' / 'Add target' quick fix for one diagnostic, if any. */
export function selectElementFix(
  document: LangiumDocument,
  diagnostic: Diagnostic
): SelectElementFix | undefined {
  if (
    !DEPENDENCY_CODES.has(String(diagnostic.code)) ||
    !diagnostic.message.includes("'selectedElement'")
  ) {
    return undefined;
  }
  const root = document.parseResult.value.$cstNode;
  if (!root) return undefined;
  const offset = document.textDocument.offsetAt(diagnostic.range.start);
  const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
  const call = leaf ? AstUtils.getContainerOfType(leaf.astNode, isOperationCall) : undefined;
  if (!call?.$cstNode) return undefined;
  const start = call.$cstNode.range.start;

  // `at 0s..1s show("#a")`: no block to insert into, add a target to the event
  const event = call.$container;
  if (isTimedEvent(event) && event.action === call) {
    if (event.target !== undefined) return undefined;
    const selector = targetFor(call);
    return {
      title: `Add target ${selector}`,
      range: { start, end: start },
      newText: `target ${selector} `,
    };
  }

  const selector = guessSelector(call);
  const lineText = document.textDocument.getText({
    start: { line: start.line, character: 0 },
    end: start,
  });
  // On its own line: insert a line above with the same indentation; inline: before it
  const separator = lineText.trim() === '' ? `\n${lineText}` : ' ';
  return {
    title: `Insert selectElement(${selector})`,
    range: { start, end: start },
    newText: `selectElement(${selector})${separator}`,
  };
}

export function selectElementCodeActions(
  document: LangiumDocument,
  diagnostics: readonly Diagnostic[]
): CodeAction[] {
  return diagnostics.flatMap(diagnostic => {
    const fix = selectElementFix(document, diagnostic);
    if (!fix) return [];
    return [
      {
        title: fix.title,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: {
          changes: {
            [document.uri.toString()]: [{ range: fix.range, newText: fix.newText }],
          },
        },
      },
    ];
  });
}
