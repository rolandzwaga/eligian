/**
 * Eligian Formatter
 *
 * Handles document formatting, including JSDoc template auto-generation when typing `/**`.
 */

import type { LangiumDocument } from 'langium';
import { AbstractFormatter } from 'langium/lsp';
import type {
  DocumentOnTypeFormattingOptions,
  DocumentOnTypeFormattingParams,
  TextEdit,
} from 'vscode-languageserver-protocol';
import type { EligianServices } from './eligian-module.js';
import { generateJSDocTemplate } from './jsdoc/jsdoc-template-generator.js';
import { findActionBelow } from './utils/ast-navigation.js';

export class EligianFormatter extends AbstractFormatter {
  constructor(_services: EligianServices) {
    super();
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
   */
  override formatDocumentOnType(
    document: LangiumDocument,
    params: DocumentOnTypeFormattingParams
  ): TextEdit[] {
    // Check if we just typed the second * in /**
    if (params.ch === '*') {
      const text = document.textDocument.getText();
      const position = params.position;
      const lineStart = document.textDocument.offsetAt({ line: position.line, character: 0 });
      const lineEnd = document.textDocument.offsetAt(position);
      const lineText = text.substring(lineStart, lineEnd);

      // Check if line ends with /** (we just typed the second *)
      const trimmed = lineText.trimEnd();
      if (trimmed.endsWith('/**')) {
        // Find the action definition on the line below
        const actionBelow = findActionBelow(document, position);

        if (actionBelow) {
          // Generate JSDoc template
          const template = generateJSDocTemplate(actionBelow);

          // Parse template lines (skip first line which is /** - already typed)
          const lines = template.split('\n');
          const templateLines = lines.slice(1); // Skip first /** line

          // Build the text to insert (without snippet placeholders for formatter)
          const insertLines: string[] = [];
          for (const line of templateLines) {
            // Remove snippet placeholders like ${1:description}
            const cleanLine = line.replace(/\$\{\d+:([^}]+)\}/g, '$1');
            insertLines.push(cleanLine);
          }

          const insertText = `\n${insertLines.join('\n')}`;

          // Create text edit to insert at current cursor position
          const edit: TextEdit = {
            range: {
              start: position,
              end: position,
            },
            newText: insertText,
          };

          return [edit];
        }
      }
    }

    // Not a JSDoc trigger, return no edits
    return [];
  }
}
