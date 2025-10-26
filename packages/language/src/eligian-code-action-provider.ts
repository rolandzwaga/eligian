/**
 * Eligian Code Action Provider
 *
 * Main code action provider for Eligian DSL that orchestrates all code action logic.
 * Currently delegates to CSS code action provider for CSS-related quick fixes.
 */

import type { LangiumDocument } from 'langium';
import type { CodeActionProvider } from 'langium/lsp';
import type { CodeAction, CodeActionParams, Command } from 'vscode-languageserver-protocol';
import { CSSCodeActionProvider } from './css/css-code-actions.js';
import type { EligianServices } from './eligian-module.js';

/**
 * Eligian-specific code action provider
 *
 * Provides quick fixes and refactorings for Eligian DSL code.
 */
export class EligianCodeActionProvider implements CodeActionProvider {
  private readonly cssCodeActionProvider: CSSCodeActionProvider;
  private readonly services: EligianServices;

  constructor(services: EligianServices) {
    this.services = services;
    this.cssCodeActionProvider = new CSSCodeActionProvider();
  }

  /**
   * Get code actions for a given document and range
   *
   * @param document - Langium document
   * @param params - LSP CodeActionParams with diagnostics and range
   * @returns Array of CodeActions (quick fixes, refactorings, etc.)
   */
  async getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams
  ): Promise<Array<Command | CodeAction>> {
    const actions: CodeAction[] = [];

    // Get CSS-related code actions
    const documentUri = document.uri.toString();
    const cssRegistry = this.services.css.CSSRegistry;

    // Create a readFile function that uses the workspace file system
    const readFile = async (uri: string): Promise<string> => {
      // Convert URI to path and read using Node.js fs
      // Handle both encoded (file:///c%3A/...) and unencoded (file:///c:/...) URIs
      let path = uri.replace('file:///', '');
      path = decodeURIComponent(path); // Decode URL-encoded characters
      const fs = await import('node:fs/promises');
      return await fs.readFile(path, 'utf-8');
    };

    const cssActions = await this.cssCodeActionProvider.provideCodeActions(
      params,
      documentUri,
      cssRegistry,
      readFile
    );

    actions.push(...cssActions);

    // Future: Add more code action providers here
    // - Refactoring actions (extract action, inline action, etc.)
    // - Import management actions
    // - Timeline optimization actions

    return actions;
  }
}
