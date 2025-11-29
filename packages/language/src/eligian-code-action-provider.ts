// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: bullshit
/**
 * Eligian Code Action Provider
 *
 * Main code action provider for Eligian DSL that orchestrates all code action logic.
 * Currently delegates to CSS code action provider for CSS-related quick fixes.
 */

import fs from 'node:fs/promises';
import type { LangiumDocument } from 'langium';
import type { CodeActionProvider } from 'langium/lsp';
import type {
  CancellationToken,
  CodeAction,
  CodeActionParams,
  Command,
} from 'vscode-languageserver-protocol';
import { CodeActionKind } from 'vscode-languageserver-protocol';
import { CSSCodeActionProvider } from './css/css-code-actions.js';
import type { EligianServices } from './eligian-module.js';
import { MISSING_LABELS_FILE_CODE } from './eligian-validator.js';
import type { Program } from './generated/ast.js';
import { LanguageBlockCodeActionProvider } from './labels/language-block-code-actions.js';
import type {
  CreateLabelEntryCommand,
  CreateLabelsFileCommand,
  MissingLabelIDData,
  MissingLabelsFileData,
} from './types/code-actions.js';
/**
 * Eligian-specific code action provider
 *
 * Provides quick fixes and refactorings for Eligian DSL code.
 */
export class EligianCodeActionProvider implements CodeActionProvider {
  private readonly cssCodeActionProvider: CSSCodeActionProvider;
  private readonly languageBlockCodeActionProvider: LanguageBlockCodeActionProvider;

  constructor(private readonly services: EligianServices) {
    this.cssCodeActionProvider = new CSSCodeActionProvider();
    this.languageBlockCodeActionProvider = new LanguageBlockCodeActionProvider();
  }

  /**
   * Get code actions for a given document and range
   *
   * @param document - Langium document
   * @param params - LSP CodeActionParams with diagnostics and range
   * @param cancelToken - Optional cancellation token
   * @returns Array of CodeActions (quick fixes, refactorings, etc.) or undefined
   */
  async getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams,
    _cancelToken?: CancellationToken
  ): Promise<Array<Command | CodeAction> | undefined> {
    try {
      const actions: CodeAction[] = [];

      // Safety check: ensure document has valid parse result
      if (!document.parseResult?.value) {
        console.error('[CodeActions] Document has no parse result, skipping');
        return actions;
      }

      // Get CSS-related code actions
      const documentUri = document.uri.toString();
      const cssRegistry = this.services.css.CSSRegistry;

      // Create a readFile function that uses the workspace file system
      const readFile = async (uri: string): Promise<string> => {
        // Convert URI to path and read using Node.js fs
        // Handle both encoded (file:///c%3A/...) and unencoded (file:///c:/...) URIs
        let path = uri.replace('file:///', '');
        path = decodeURIComponent(path); // Decode URL-encoded characters
        return await fs.readFile(path, 'utf-8');
      };

      const cssActions = await this.cssCodeActionProvider.provideCodeActions(
        params,
        documentUri,
        cssRegistry,
        readFile
      );

      actions.push(...cssActions);

      // Get language block code actions
      const program = document.parseResult.value as Program;
      const languageBlockActions = await this.languageBlockCodeActionProvider.provideCodeActions(
        params,
        program,
        documentUri,
        readFile
      );

      actions.push(...languageBlockActions);

      // Feature 039 - T005: Handle missing labels file diagnostics
      const labelsFileActions = this.createLabelsFileActions(params, documentUri);
      actions.push(...labelsFileActions);

      // Feature 041 - T022: Handle missing label entry diagnostics
      const labelEntryActions = this.createLabelEntryActions(params, documentUri);
      actions.push(...labelEntryActions);

      // Future: Add more code action providers here
      // - Refactoring actions (extract action, inline action, etc.)
      // - Import management actions
      // - Timeline optimization actions

      return actions;
    } catch (error) {
      console.error('[CodeActions] Error in getCodeActions:', error);
      // Return empty array to prevent crash
      return [];
    }
  }

  /**
   * Feature 039 - T006: Create code actions for missing labels files
   *
   * Creates quick fix actions that trigger the 'eligian.createLabelsFile' command
   * to create missing labels files with appropriate content (empty array or template).
   *
   * @param params - LSP CodeActionParams with diagnostics
   * @param documentUri - URI of the Eligian document
   * @returns Array of CodeActions for missing labels files
   */
  private createLabelsFileActions(params: CodeActionParams, documentUri: string): CodeAction[] {
    const actions: CodeAction[] = [];

    // Safety check: ensure diagnostics array exists
    if (!params.context?.diagnostics) {
      return actions;
    }

    // Filter diagnostics for missing labels file
    const missingLabelsFileDiagnostics = params.context.diagnostics.filter(
      diag => diag.code === MISSING_LABELS_FILE_CODE
    );

    // Create code action for each missing labels file
    for (const diagnostic of missingLabelsFileDiagnostics) {
      const action = this.createLabelsFileAction(diagnostic, documentUri);
      if (action) {
        actions.push(action);
      }
    }

    return actions;
  }

  /**
   * Feature 039 - T006: Create a single code action for a missing labels file
   *
   * @param diagnostic - Diagnostic with missing labels file data
   * @param documentUri - URI of the Eligian document
   * @returns CodeAction or undefined if data is invalid
   */
  private createLabelsFileAction(
    diagnostic: import('vscode-languageserver-protocol').Diagnostic,
    documentUri: string
  ): CodeAction | undefined {
    // Extract diagnostic data
    const data = diagnostic.data as MissingLabelsFileData | undefined;
    if (!data) return undefined;

    // Feature 039 - T021: Generate content based on languages block
    const content = this.generateLabelsFileContent(
      data.hasLanguagesBlock,
      data.languageCodes || []
    );

    // Create command arguments
    const commandArgs: CreateLabelsFileCommand = {
      filePath: data.resolvedPath,
      content,
      documentUri,
      languageCodes: data.languageCodes,
    };

    // Create code action
    const action: CodeAction = {
      title: 'Create labels file',
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: {
        title: 'Create labels file',
        command: 'eligian.createLabelsFile',
        arguments: [commandArgs],
      },
    };

    return action;
  }

  /**
   * Feature 039 - T018: Generate labels file content based on languages block
   *
   * @param hasLanguagesBlock - Whether the Eligian file has a languages block
   * @param languageCodes - Array of language codes from the languages block
   * @returns JSON string content for the labels file
   */
  private generateLabelsFileContent(hasLanguagesBlock: boolean, languageCodes: string[]): string {
    if (!hasLanguagesBlock || languageCodes.length === 0) {
      return '[]';
    }

    // Create example label group with translations for each language
    const labelGroup = {
      id: 'example.label',
      labels: languageCodes.map((code, index) => ({
        id: String(index + 1),
        languageCode: code,
        label: this.getLanguageName(code),
      })),
    };

    return JSON.stringify([labelGroup], null, 2);
  }

  /**
   * Feature 039 - T019: Get placeholder text for a language code
   *
   * @param code - Language code (e.g., "en-US", "nl-NL")
   * @returns Placeholder text for the language
   */
  private getLanguageName(code: string): string {
    const languageMap: Record<string, string> = {
      'en-US': 'Example EN',
      'nl-NL': 'Voorbeeld NL',
      'fr-FR': 'Exemple FR',
      'de-DE': 'Beispiel DE',
    };

    return languageMap[code] || `Example ${code}`;
  }

  // ============================================================================
  // Feature 041: Missing Label Entry Quick Fix
  // ============================================================================

  /**
   * Feature 041 - T019: Create code actions for missing label entries
   *
   * Creates quick fix actions that trigger the 'eligian.createLabelEntry' command
   * to add missing label entries to existing labels files.
   *
   * @param params - LSP CodeActionParams with diagnostics
   * @param documentUri - URI of the Eligian document
   * @returns Array of CodeActions for missing label entries
   */
  private createLabelEntryActions(params: CodeActionParams, documentUri: string): CodeAction[] {
    const actions: CodeAction[] = [];

    // Safety check: ensure diagnostics array exists
    if (!params.context?.diagnostics) {
      return actions;
    }

    // T020: Filter diagnostics for unknown_label_id code
    const missingLabelDiagnostics = params.context.diagnostics.filter(
      diag => (diag.data as MissingLabelIDData | undefined)?.code === 'unknown_label_id'
    );

    // Create code action for each missing label
    for (const diagnostic of missingLabelDiagnostics) {
      const action = this.createLabelEntryAction(diagnostic, documentUri);
      if (action) {
        actions.push(action);
      }
    }

    return actions;
  }

  /**
   * Feature 041 - T021: Create a single code action for a missing label entry
   *
   * @param diagnostic - Diagnostic with missing label ID data
   * @param documentUri - URI of the Eligian document
   * @returns CodeAction or undefined if data is invalid
   */
  private createLabelEntryAction(
    diagnostic: import('vscode-languageserver-protocol').Diagnostic,
    documentUri: string
  ): CodeAction | undefined {
    // Extract diagnostic data
    const data = diagnostic.data as MissingLabelIDData | undefined;
    if (!data || data.code !== 'unknown_label_id') return undefined;

    // Validate required fields
    if (!data.labelId || !data.labelsFileUri || !data.languageCodes?.length) {
      return undefined;
    }

    // Convert labels file URI to file path
    // Handle both encoded (file:///c%3A/...) and unencoded (file:///c:/...) URIs
    let labelsFilePath = data.labelsFileUri.replace('file:///', '');
    labelsFilePath = decodeURIComponent(labelsFilePath);

    // Create command arguments
    const commandArgs: CreateLabelEntryCommand = {
      labelId: data.labelId,
      labelsFilePath,
      languageCodes: data.languageCodes,
      documentUri,
    };

    // Create code action with descriptive title
    const action: CodeAction = {
      title: `Create label entry '${data.labelId}'`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: {
        title: `Create label entry '${data.labelId}'`,
        command: 'eligian.createLabelEntry',
        arguments: [commandArgs],
      },
    };

    return action;
  }
}
