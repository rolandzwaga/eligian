/**
 * Quick fix for unknown CSS classes and ids with suggestions (audit feature
 * idea #18): "Unknown CSS ID in selector: 'tok-timelin'. Did you mean:
 * tok-timeline?" offers *Change to 'tok-timeline'*, which replaces the name
 * inside the string the diagnostic is on (a selector or class-name literal,
 * passed to an operation or to an action parameter).
 */
import type { LangiumDocument } from 'langium';
import { type CodeAction, CodeActionKind, type Diagnostic } from 'vscode-languageserver-protocol';

const CODES = new Set([
  'unknown_css_class',
  'unknown_css_class_in_selector',
  'unknown_css_id_in_selector',
]);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function didYouMeanCodeActions(
  document: LangiumDocument,
  diagnostics: readonly Diagnostic[]
): CodeAction[] {
  const actions: CodeAction[] = [];
  for (const diagnostic of diagnostics) {
    const code = (diagnostic.data as { code?: string } | undefined)?.code;
    if (!code || !CODES.has(code)) continue;
    const unknown = /'([^']+)'/.exec(diagnostic.message)?.[1];
    const suggestions = /Did you mean: ([^?]+)\?/.exec(diagnostic.message)?.[1]?.split(', ') ?? [];
    if (!unknown || suggestions.length === 0) continue;

    // The name inside the string the diagnostic covers (`.name` / `#name` / `name`)
    const text = document.textDocument.getText(diagnostic.range);
    const prefix =
      code === 'unknown_css_id_in_selector' ? '#' : code.includes('selector') ? '\\.' : '';
    const match = new RegExp(`${prefix}(${escapeRegExp(unknown)})(?![\\w-])`).exec(text);
    if (!match) continue;
    const startOffset =
      document.textDocument.offsetAt(diagnostic.range.start) +
      match.index +
      match[0].length -
      unknown.length;
    const range = {
      start: document.textDocument.positionAt(startOffset),
      end: document.textDocument.positionAt(startOffset + unknown.length),
    };

    suggestions.forEach((suggestion, index) => {
      actions.push({
        title: `Change to '${suggestion}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: index === 0,
        edit: { changes: { [document.uri.toString()]: [{ range, newText: suggestion }] } },
      });
    });
  }
  return actions;
}
