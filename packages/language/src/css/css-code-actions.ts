/**
 * CSS Code Action Provider
 *
 * Provides quick fix code actions for CSS-related diagnostics:
 * - Create missing CSS class in imported CSS file
 * - Create missing CSS ID in imported CSS file
 *
 * This provider filters diagnostics for CSS-related errors and generates
 * CodeAction items that apply WorkspaceEdits to add the missing CSS rules.
 */

import type { CodeAction, CodeActionParams, Diagnostic } from 'vscode-languageserver-protocol';
import { CodeActionKind } from 'vscode-languageserver-protocol';
import {
  createCSSClassEdit,
  createCSSIDEdit,
  extractClassNameFromDiagnostic,
  extractIDNameFromDiagnostic,
  isCSSRelatedDiagnostic,
} from './code-action-helpers.js';
import type { CSSRegistryService } from './css-registry.js';

/**
 * CSS Code Action Provider
 *
 * Pure, stateless provider that generates quick fix code actions for CSS errors.
 */
export class CSSCodeActionProvider {
  /**
   * Provide code actions for CSS-related diagnostics
   *
   * Strategy:
   * 1. Filter diagnostics for CSS-related codes (css-unknown-class, css-unknown-id)
   * 2. For each CSS error, extract the class/ID name
   * 3. Get the first imported CSS file from CSSRegistry
   * 4. If CSS file available, create CodeAction with WorkspaceEdit
   * 5. Return array of CodeActions
   *
   * @param params - LSP CodeActionParams with diagnostics
   * @param documentUri - URI of the Eligian document
   * @param cssRegistry - CSS registry service
   * @param readFile - Function to read CSS file content (for calculating edit position)
   * @returns Array of CodeActions (quick fixes)
   */
  async provideCodeActions(
    params: CodeActionParams,
    documentUri: string,
    cssRegistry: CSSRegistryService,
    readFile: (uri: string) => Promise<string>
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    // Get imported CSS files for this document
    const importedCSSFiles = Array.from(cssRegistry.getDocumentImports(documentUri));

    // If no CSS files imported, we can't create quick fixes
    if (importedCSSFiles.length === 0) {
      return actions;
    }

    // Use the first imported CSS file as the target
    const targetCSSFile = importedCSSFiles[0];
    if (!targetCSSFile) {
      return actions;
    }

    // Convert relative CSS path to absolute URI
    // The CSS path is relative to the document, so resolve it
    const cssFileUri = this.resolveCSSPath(documentUri, targetCSSFile);

    // Read the CSS file content (needed to calculate insert position)
    let cssFileContent: string;
    try {
      cssFileContent = await readFile(cssFileUri);
    } catch (_error) {
      // If we can't read the file, we can't create quick fixes
      return actions;
    }

    // Safety check: ensure diagnostics array exists
    if (!params.context?.diagnostics) {
      return actions;
    }

    // Filter diagnostics for CSS-related errors
    const cssDiagnostics = params.context.diagnostics.filter(isCSSRelatedDiagnostic);

    // Create code actions for each CSS diagnostic
    for (const diagnostic of cssDiagnostics) {
      const codeAction = this.createQuickFixAction(
        diagnostic,
        cssFileUri,
        cssFileContent,
        documentUri
      );

      if (codeAction) {
        actions.push(codeAction);
      } else {
      }
    }
    return actions;
  }

  /**
   * Create a quick fix CodeAction for a CSS diagnostic
   *
   * @param diagnostic - CSS-related diagnostic
   * @param cssFileUri - Target CSS file URI
   * @param cssFileContent - Content of the CSS file
   * @param documentUri - URI of the Eligian document
   * @returns CodeAction or undefined
   */
  private createQuickFixAction(
    diagnostic: Diagnostic,
    cssFileUri: string,
    cssFileContent: string,
    _documentUri: string
  ): CodeAction | undefined {
    // Try to extract class name
    const className = extractClassNameFromDiagnostic(diagnostic);
    if (className) {
      const edit = createCSSClassEdit(cssFileUri, className, cssFileContent);

      const action = {
        title: `Create '.${className}' in ${this.getFileName(cssFileUri)}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit,
        // Open the CSS file after applying the edit
        command: {
          title: 'Open CSS file',
          command: 'vscode.open',
          arguments: [cssFileUri],
        },
      };
      return action;
    }

    // Try to extract ID name
    const idName = extractIDNameFromDiagnostic(diagnostic);
    if (idName) {
      const edit = createCSSIDEdit(cssFileUri, idName, cssFileContent);

      const action = {
        title: `Create '#${idName}' in ${this.getFileName(cssFileUri)}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit,
        // Open the CSS file after applying the edit
        command: {
          title: 'Open CSS file',
          command: 'vscode.open',
          arguments: [cssFileUri],
        },
      };
      return action;
    }

    return undefined;
  }

  /**
   * Resolve a relative CSS file path to an absolute file URI
   *
   * @param documentUri - URI of the Eligian document (e.g., "file:///c:/projects/test.eligian")
   * @param cssPath - Relative CSS path (e.g., "./styles.css")
   * @returns Absolute file URI (e.g., "file:///c:/projects/styles.css")
   */
  private resolveCSSPath(documentUri: string, cssPath: string): string {
    // If cssPath is already absolute, return it
    if (cssPath.startsWith('file://')) {
      return cssPath;
    }

    // Get the directory of the document
    const docUri = documentUri.replace(/\\/g, '/'); // Normalize backslashes
    const lastSlash = docUri.lastIndexOf('/');
    const docDir = docUri.substring(0, lastSlash + 1);

    // Remove leading "./" from CSS path if present
    const cleanPath = cssPath.startsWith('./') ? cssPath.substring(2) : cssPath;

    // Combine directory with CSS path
    return docDir + cleanPath;
  }

  /**
   * Extract filename from URI for display in code action title
   *
   * @param uri - File URI
   * @returns Filename
   */
  private getFileName(uri: string): string {
    const parts = uri.split('/');
    return parts[parts.length - 1] || uri;
  }
}
