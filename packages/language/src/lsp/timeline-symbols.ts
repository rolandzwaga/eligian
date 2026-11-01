/**
 * Timeline names as symbols (audit feature idea #16).
 *
 * `navigate "<name>"` targets are strings in the grammar (a cross-reference
 * would make every timeline name a token of its own); these helpers connect
 * them to the timeline of the same program with that name, for Go to
 * Definition, Find References, Rename, completion and quick fixes.
 */
import { AstUtils, type CstNode, CstUtils, GrammarUtils, type LangiumDocument } from 'langium';
import {
  type CodeAction,
  CodeActionKind,
  type CompletionItem,
  CompletionItemKind,
  type Diagnostic,
  type Range,
  type TextEdit,
} from 'vscode-languageserver-protocol';
import { levenshteinDistance } from '../css/levenshtein.js';
import {
  isNavigateStatement,
  isProgram,
  isTimeline,
  type NavigateStatement,
  type Program,
  type Timeline,
} from '../generated/ast.js';
import { getTimelines } from '../utils/program-helpers.js';

/** The timeline name under the cursor: a timeline's own name or a navigate target. */
export interface TimelineSymbol {
  readonly name: string;
  /** The string token under the cursor (with its quotes) */
  readonly token: CstNode;
  readonly program: Program;
}

const programOf = (document: LangiumDocument): Program | undefined => {
  const root = document.parseResult.value;
  return isProgram(root) ? root : undefined;
};

/** The timeline name at `offset` in `document`, if any. */
export function timelineSymbolAt(
  document: LangiumDocument,
  offset: number
): TimelineSymbol | undefined {
  const program = programOf(document);
  const root = document.parseResult.value.$cstNode;
  if (!program || !root) return undefined;
  const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
  const node = leaf?.astNode;
  if (!leaf) return undefined;
  if (isNavigateStatement(node) && node.target !== undefined) {
    const token = GrammarUtils.findNodeForProperty(node.$cstNode, 'target');
    if (token && token.offset <= offset && offset <= token.end) {
      return { name: node.target, token, program };
    }
  }
  if (isTimeline(node)) {
    const token = GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
    if (token && token.offset <= offset && offset <= token.end) {
      return { name: node.name, token, program };
    }
  }
  return undefined;
}

/** The timeline named `name` in `program`. */
export function timelineNamed(program: Program, name: string): Timeline | undefined {
  return getTimelines(program).find(timeline => timeline.name === name);
}

/** Every `navigate` statement of `program` that targets `name`. */
export function navigatesTo(program: Program, name: string): NavigateStatement[] {
  return AstUtils.streamAllContents(program)
    .filter(isNavigateStatement)
    .filter(statement => statement.target === name)
    .toArray();
}

/** The string tokens (with quotes) of a timeline's name and of the navigates targeting it. */
export function timelineNameTokens(
  program: Program,
  name: string
): { readonly declaration?: CstNode; readonly references: CstNode[] } {
  const timeline = timelineNamed(program, name);
  const declaration = timeline
    ? GrammarUtils.findNodeForProperty(timeline.$cstNode, 'name')
    : undefined;
  const references = navigatesTo(program, name)
    .map(statement => GrammarUtils.findNodeForProperty(statement.$cstNode, 'target'))
    .filter((token): token is CstNode => token !== undefined);
  return { declaration, references };
}

/** The range inside a string token's quotes. */
export function innerRange(token: CstNode): Range {
  const { start, end } = token.range;
  return {
    start: { line: start.line, character: start.character + 1 },
    end: { line: end.line, character: end.character - 1 },
  };
}

/** Text edits that rename the timeline `name` and every navigate targeting it. */
export function renameTimelineEdits(program: Program, name: string, newName: string): TextEdit[] {
  const { declaration, references } = timelineNameTokens(program, name);
  return [...(declaration ? [declaration] : []), ...references].map(token => ({
    range: innerRange(token),
    newText: newName,
  }));
}

/** Why `name` cannot be a timeline name in a string, or undefined when it can. */
export function invalidTimelineName(name: string): string | undefined {
  if (name.trim() === '') return 'A timeline name cannot be empty';
  if (/["\\\r\n]/.test(name))
    return 'A timeline name cannot contain quotes, backslashes or line breaks';
  return undefined;
}

/**
 * Completion of timeline names after `navigate` (with or without the opening
 * quote typed): `on click "#card" navigate "|"`.
 */
export function navigateTargetCompletions(
  document: LangiumDocument,
  offset: number
): CompletionItem[] | undefined {
  const program = programOf(document);
  if (!program) return undefined;
  const text = document.textDocument.getText();
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const before = text.slice(lineStart, offset);
  const match = /\bnavigate\s+(?:"([^"]*))?$/.exec(before);
  if (!match) return undefined;
  const quoted = match[1] !== undefined;
  // Replace from the opening quote (when typed) to the closing one (auto-inserted or typed)
  const startOffset = quoted ? offset - match[1].length - 1 : offset;
  const after = /^[^"\s]*"/.exec(text.slice(offset));
  const endOffset = quoted && after ? offset + after[0].length : offset;
  const range = {
    start: document.textDocument.positionAt(startOffset),
    end: document.textDocument.positionAt(endOffset),
  };
  return getTimelines(program).map((timeline, index) => ({
    label: timeline.name,
    kind: CompletionItemKind.Reference,
    detail: `timeline (${timeline.provider})`,
    sortText: `0_${String(index).padStart(3, '0')}`,
    filterText: `"${timeline.name}"`,
    textEdit: { range, newText: `"${timeline.name}"` },
  }));
}

/** Timeline names of `program` close to `name` (Levenshtein), nearest first. */
export function similarTimelineNames(program: Program, name: string, max = 3): string[] {
  const threshold = Math.max(2, Math.floor(name.length / 3));
  return getTimelines(program)
    .map(timeline => ({ name: timeline.name, distance: levenshteinDistance(name, timeline.name) }))
    .filter(candidate => candidate.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max)
    .map(candidate => candidate.name);
}

/**
 * Quick fixes for `unknown_navigate_target`: 'Change to "<closest>"' and
 * 'Create timeline "<name>"' (appended at the end, with the container and
 * provider of the first timeline).
 */
export function navigateTargetCodeActions(
  document: LangiumDocument,
  diagnostics: readonly Diagnostic[]
): CodeAction[] {
  const program = programOf(document);
  if (!program) return [];
  const uri = document.uri.toString();
  const actions: CodeAction[] = [];
  for (const diagnostic of diagnostics) {
    if ((diagnostic.data as { code?: string } | undefined)?.code !== 'unknown_navigate_target') {
      continue;
    }
    const offset = document.textDocument.offsetAt(diagnostic.range.start);
    const symbol = timelineSymbolAt(document, offset + 1);
    if (!symbol) continue;

    similarTimelineNames(program, symbol.name).forEach((candidate, index) => {
      actions.push({
        title: `Change to "${candidate}"`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: index === 0,
        edit: { changes: { [uri]: [{ range: innerRange(symbol.token), newText: candidate }] } },
      });
    });

    if (invalidTimelineName(symbol.name) === undefined) {
      const first = getTimelines(program)[0];
      const container = first?.containerSelector ?? '#stage';
      const end = document.textDocument.positionAt(document.textDocument.getText().length);
      const text = document.textDocument.getText();
      const separator = text.endsWith('\n') ? '\n' : '\n\n';
      actions.push({
        title: `Create timeline "${symbol.name}"`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [uri]: [
              {
                range: { start: end, end },
                newText: `${separator}timeline "${symbol.name}" in "${container}" using raf {\n}\n`,
              },
            ],
          },
        },
      });
    }
  }
  return actions;
}
