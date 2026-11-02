/**
 * Completion of key names after `on key` (with or without the opening quote
 * typed): `on key "|" seek intro.end`.
 */
import type { LangiumDocument } from 'langium';
import { type CompletionItem, CompletionItemKind } from 'vscode-languageserver-protocol';
import { KEY_COMPLETIONS } from '../utils/key-names.js';

export function keyNameCompletions(
  document: LangiumDocument,
  offset: number
): CompletionItem[] | undefined {
  const text = document.textDocument.getText();
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const match = /\bon\s+key\s+(?:"([^"]*))?$/.exec(text.slice(lineStart, offset));
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
  return [...KEY_COMPLETIONS].map(([key, description], index) => ({
    label: key,
    kind: CompletionItemKind.Constant,
    detail: description,
    sortText: `0_${String(index).padStart(3, '0')}`,
    filterText: `"${key}"`,
    textEdit: { range, newText: `"${key}"` },
  }));
}
