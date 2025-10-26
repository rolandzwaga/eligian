/**
 * CSS Code Action Helpers
 *
 * This module provides utilities for creating code actions (quick fixes)
 * related to CSS classes and IDs in the Eligian DSL.
 */

import type { Diagnostic, TextEdit, WorkspaceEdit } from 'vscode-languageserver-protocol';
import { TextEdit as TextEditCreator } from 'vscode-languageserver-protocol';

/**
 * Diagnostic codes related to CSS validation
 *
 * These are the codes used by Feature 013 CSS validation
 * These must match the codes set in eligian-validator.ts
 */
export const CSS_RELATED_CODES = [
  'unknown_css_class',
  'unknown_css_class_in_selector',
  'unknown_css_id_in_selector',
  'invalid_css_selector',
];

/**
 * Extract CSS class name from a diagnostic message
 *
 * Diagnostic messages from Feature 013 follow the pattern:
 * - "Unknown CSS class 'button'"
 * - "CSS class 'button' is not defined in any imported CSS files"
 *
 * This function extracts the class name from these messages.
 *
 * @param diagnostic - LSP diagnostic with CSS error
 * @returns Class name (without dot prefix) or undefined
 */
export function extractClassNameFromDiagnostic(diagnostic: Diagnostic): string | undefined {
  const message = diagnostic.message;

  // Match patterns like:
  // - "Unknown CSS class: 'button'"
  // - "Unknown CSS class in selector: 'button'"
  // - "CSS class 'button' is not defined"
  const match = message.match(/class[^']*'([^']+)'/);
  if (match) {
    return match[1];
  }

  return undefined;
}

/**
 * Extract CSS ID name from a diagnostic message
 *
 * Similar to extractClassNameFromDiagnostic but for IDs.
 *
 * @param diagnostic - LSP diagnostic with CSS error
 * @returns ID name (without hash prefix) or undefined
 */
export function extractIDNameFromDiagnostic(diagnostic: Diagnostic): string | undefined {
  const message = diagnostic.message;

  // Match patterns like:
  // - "Unknown CSS ID: 'header'"
  // - "Unknown CSS ID in selector: 'header'"
  // - "CSS ID 'header' is not defined"
  const match = message.match(/ID[^']*'([^']+)'/);
  if (match) {
    return match[1];
  }

  return undefined;
}

/**
 * Create a WorkspaceEdit that adds a CSS class to a file
 *
 * The edit appends the new class at the end of the CSS file with:
 * - Newline before the class (if file doesn't end with newline)
 * - CSS rule: `.className {\n  /* TODO: Add styles *\/\n}\n`
 * - Newline after the class
 *
 * Strategy:
 * - Insert at end of file (safest location, no conflicts)
 * - Use Range at last line to append
 *
 * @param cssFileUri - URI of the CSS file to edit
 * @param className - Class name (without dot prefix)
 * @param cssFileContent - Current content of the CSS file (for calculating insert position)
 * @returns WorkspaceEdit with text insertion
 */
export function createCSSClassEdit(
  cssFileUri: string,
  className: string,
  cssFileContent: string
): WorkspaceEdit {
  // Calculate the line count in the CSS file
  const lines = cssFileContent.split('\n');
  const lastLineNumber = lines.length - 1;
  const lastLineLength = lines[lastLineNumber]?.length ?? 0;

  // Create the new CSS rule text
  const newClassRule = `\n.${className} {\n  /* TODO: Add styles */\n}\n`;

  // Create text edit at end of file
  const textEdit: TextEdit = TextEditCreator.insert(
    { line: lastLineNumber, character: lastLineLength },
    newClassRule
  );

  // Create workspace edit
  return {
    changes: {
      [cssFileUri]: [textEdit],
    },
  };
}

/**
 * Create a WorkspaceEdit that adds a CSS ID to a file
 *
 * Similar to createCSSClassEdit but for IDs.
 *
 * @param cssFileUri - URI of the CSS file to edit
 * @param idName - ID name (without hash prefix)
 * @param cssFileContent - Current content of the CSS file
 * @returns WorkspaceEdit with text insertion
 */
export function createCSSIDEdit(
  cssFileUri: string,
  idName: string,
  cssFileContent: string
): WorkspaceEdit {
  // Calculate the line count in the CSS file
  const lines = cssFileContent.split('\n');
  const lastLineNumber = lines.length - 1;
  const lastLineLength = lines[lastLineNumber]?.length ?? 0;

  // Create the new CSS rule text
  const newIDRule = `\n#${idName} {\n  /* TODO: Add styles */\n}\n`;

  // Create text edit at end of file
  const textEdit: TextEdit = TextEditCreator.insert(
    { line: lastLineNumber, character: lastLineLength },
    newIDRule
  );

  // Create workspace edit
  return {
    changes: {
      [cssFileUri]: [textEdit],
    },
  };
}

/**
 * Check if a diagnostic is related to CSS validation
 *
 * @param diagnostic - LSP diagnostic
 * @returns True if diagnostic is a CSS error
 */
export function isCSSRelatedDiagnostic(diagnostic: Diagnostic): boolean {
  // Langium stores custom validation codes in diagnostic.data.code
  const data = diagnostic.data as { code?: string } | undefined;

  if (data && typeof data.code === 'string') {
    return CSS_RELATED_CODES.includes(data.code);
  }
  return false;
}
