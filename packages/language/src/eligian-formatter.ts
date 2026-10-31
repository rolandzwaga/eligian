/**
 * Eligian Formatter
 *
 * Handles document formatting, including JSDoc template auto-generation when typing `/**`.
 */

import type { AstNode, LangiumDocument } from 'langium';
import { AbstractFormatter } from 'langium/lsp';
import type {
  DocumentOnTypeFormattingOptions,
  DocumentOnTypeFormattingParams,
  Position,
  TextEdit,
} from 'vscode-languageserver-protocol';
import type { EligianServices } from './eligian-module.js';
import { generateJSDocTemplate } from './jsdoc/jsdoc-template-generator.js';
import { findActionAtOrAfterOffset } from './utils/ast-navigation.js';

/** Closes an otherwise unterminated `/**` so the document below it can still be parsed. */
const COMMENT_TERMINATOR = ' */';

export class EligianFormatter extends AbstractFormatter {
  private readonly services: EligianServices;

  constructor(services: EligianServices) {
    super();
    this.services = services;
  }

  /**
   * Format AST nodes (not used currently, but required by AbstractFormatter)
   */
  protected format(): void {
    // No special formatting rules for now
  }

  /**
   * Enable on-type formatting when user types `*` (for JSDoc auto-generation)
   */
  override get formatOnTypeOptions(): DocumentOnTypeFormattingOptions | undefined {
    const options = {
      firstTriggerCharacter: '*',
      // No additional trigger characters needed
    };
    return options;
  }

  /**
   * Handle formatting when user types `*`
   *
   * This is called automatically when the user types the second `*` in `/**`.
   * We detect this pattern and auto-generate the JSDoc template.
   *
   * Right after the trigger the comment is usually still unterminated, which
   * makes the real parse fail (the lexer swallows everything up to the next
   * `*&#47;` or the end of the file). The action to document is therefore located
   * in a re-parse of the text where the comment is closed on the cursor line.
   */
  override formatDocumentOnType(
    document: LangiumDocument,
    params: DocumentOnTypeFormattingParams
  ): TextEdit[] {
    if (params.ch !== '*') {
      return [];
    }

    const textDocument = document.textDocument;
    const text = textDocument.getText();
    const position = params.position;
    const lineStart = textDocument.offsetAt({ line: position.line, character: 0 });
    const cursorOffset = textDocument.offsetAt(position);
    const lineText = text.substring(lineStart, cursorOffset);

    // Check if line ends with /** (we just typed the second *)
    if (!lineText.trimEnd().endsWith('/**')) {
      return [];
    }

    const nextLineStart = textDocument.offsetAt({ line: position.line + 1, character: 0 });
    const lineEnd = this.endOfLine(text, cursorOffset);
    const restOfLine = text.substring(cursorOffset, lineEnd);
    const closingMatch = /^\s*\*\//.exec(restOfLine);
    const isTerminatedOnLine = restOfLine.includes('*/');

    const root = isTerminatedOnLine
      ? document.parseResult.value
      : this.parseWithClosedComment(text, cursorOffset);
    const startOffset = isTerminatedOnLine
      ? nextLineStart
      : nextLineStart + COMMENT_TERMINATOR.length;
    const actionBelow = findActionAtOrAfterOffset(root, startOffset);
    if (!actionBelow) {
      return [];
    }

    // Skip the first template line (/**) - it is already typed. When the closing
    // delimiter is already present after the cursor, drop the template's own.
    const templateLines = generateJSDocTemplate(actionBelow).split('\n').slice(1);
    if (closingMatch) {
      templateLines.pop();
    }

    // Indent the generated lines to the column of the comment, and remove snippet
    // placeholders like ${1:description} (not supported by the formatter).
    const indent = /^\s*/.exec(lineText)?.[0] ?? '';
    const body = templateLines
      .map(line => indent + line.replace(/\$\{\d+:([^}]+)\}/g, '$1'))
      .join('\n');

    // Replace the whitespace between the cursor and an existing `*/` so that the
    // closing delimiter lands on its own, aligned line.
    const end: Position = closingMatch
      ? textDocument.positionAt(cursorOffset + closingMatch[0].length - 2)
      : position;
    const newText = closingMatch ? `\n${body}\n${indent} ` : `\n${body}`;

    return [{ range: { start: position, end }, newText }];
  }

  private endOfLine(text: string, from: number): number {
    const newline = text.indexOf('\n', from);
    return newline === -1 ? text.length : newline;
  }

  /**
   * Parse a copy of the text where the comment at the cursor is terminated.
   */
  private parseWithClosedComment(text: string, cursorOffset: number): AstNode | undefined {
    const patched = text.slice(0, cursorOffset) + COMMENT_TERMINATOR + text.slice(cursorOffset);
    return this.services.parser.LangiumParser.parse(patched).value;
  }
}
