/**
 * Format .eligian source text without an editor (audit feature idea #15):
 * the rules of Format Document (lsp/format-rules.ts), for `eligian fmt` and
 * tests. A document with syntax errors is not formatted.
 */
import { EmptyFileSystem, TextDocument, URI } from 'langium';
import { createEligianServices, type EligianServices } from '../eligian-module.js';

export interface FormatSourceResult {
  /** The formatted text (the source itself when it has syntax errors) */
  readonly text: string;
  readonly changed: boolean;
  /** Lexer and parser errors that prevented formatting, as `line:column message` */
  readonly errors: readonly string[];
}

export interface FormatSourceOptions {
  /** Spaces per indentation level (default 2) */
  readonly tabSize?: number;
}

let services: EligianServices | undefined;
let counter = 0;

export async function formatSource(
  source: string,
  options: FormatSourceOptions = {}
): Promise<FormatSourceResult> {
  services ??= createEligianServices(EmptyFileSystem).Eligian;
  const document = services.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse(`memory:/format-${++counter}.eligian`)
  );
  const { lexerErrors, parserErrors } = document.parseResult;
  if (lexerErrors.length > 0 || parserErrors.length > 0) {
    const errors = [
      ...lexerErrors.map(e => `${e.line ?? 0}:${e.column ?? 0} ${e.message}`),
      ...parserErrors.map(
        e => `${e.token.startLine ?? 0}:${e.token.startColumn ?? 0} ${e.message}`
      ),
    ];
    return { text: source, changed: false, errors };
  }
  const edits =
    (await services.lsp.Formatter?.formatDocument(document, {
      textDocument: { uri: document.uri.toString() },
      options: { tabSize: options.tabSize ?? 2, insertSpaces: true },
    })) ?? [];
  const text = TextDocument.applyEdits(document.textDocument, edits);
  return { text, changed: text !== source, errors: [] };
}
