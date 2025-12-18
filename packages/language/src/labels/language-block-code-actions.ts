import { dirname, resolve } from 'node:path';
import type { CodeAction, CodeActionParams } from 'vscode-languageserver-protocol';
import { CodeActionKind, TextEdit } from 'vscode-languageserver-protocol';
import type { Program } from '../generated/ast.js';
import { isDefaultImport } from '../generated/ast.js';
import { FilePositionHelper } from './file-position-helper.js';
import { LabelsParser } from './labels-parser.js';
import { LanguageBlockGenerator } from './language-block-generator.js';
import type { LanguageCodeInfo } from './types.js';

/**
 * Provides code actions for generating language blocks from imported labels files.
 *
 * This provider:
 * 1. Detects when labels are imported but no language block exists
 * 2. Parses the labels files to extract language codes
 * 3. Generates a properly formatted language block
 * 4. Determines optimal insertion position
 * 5. Creates a workspace edit to insert the generated code
 */
export class LanguageBlockCodeActionProvider {
  private readonly labelsParser: LabelsParser;
  private readonly languageBlockGenerator: LanguageBlockGenerator;
  private readonly filePositionHelper: FilePositionHelper;

  constructor() {
    this.labelsParser = new LabelsParser();
    this.languageBlockGenerator = new LanguageBlockGenerator();
    this.filePositionHelper = new FilePositionHelper();
  }

  /**
   * Provides code actions for a given document and range.
   *
   * @param params - LSP CodeActionParams with diagnostics and range
   * @param program - Parsed Eligian program AST
   * @param documentUri - URI of the document being edited
   * @param readFile - Function to read file contents (injected for testability)
   * @returns Array of CodeActions (empty if conditions not met)
   *
   * @remarks
   * Quick fix is only provided when:
   * - At least one labels file is imported
   * - No language block currently exists in the program
   */
  async provideCodeActions(
    _params: CodeActionParams,
    program: Program,
    documentUri: string,
    readFile: (path: string) => Promise<string>
  ): Promise<CodeAction[]> {
    // Check if quick fix should be available
    if (!this.shouldProvideQuickFix(program)) {
      return [];
    }

    // Extract locales file paths from imports
    const localesFilePaths = this.extractLocalesFilePaths(program);

    if (localesFilePaths.length === 0) {
      return [];
    }

    // Get source directory for resolving relative paths
    // Convert URI to path (handle both encoded and unencoded URIs)
    let sourceFilePath = documentUri.replace('file:///', '');
    sourceFilePath = decodeURIComponent(sourceFilePath);
    const sourceDir = dirname(sourceFilePath);

    // Parse all locales files and collect language codes
    const allLanguageCodes = await this.collectLanguageCodes(localesFilePaths, sourceDir, readFile);

    // Generate language block text
    const generationResult = this.languageBlockGenerator.generate(allLanguageCodes);

    // Find insertion position
    const insertionPosition = this.filePositionHelper.findInsertionPosition(program);

    // Create workspace edit
    const edit = TextEdit.insert(insertionPosition, generationResult.text);

    // Build code action title
    const title = generationResult.isTemplate
      ? 'Generate language block (template)'
      : `Generate language block (${generationResult.languageCount} ${generationResult.languageCount === 1 ? 'language' : 'languages'})`;

    // Return code action
    return [
      {
        title,
        kind: CodeActionKind.QuickFix,
        edit: {
          changes: {
            [documentUri]: [edit],
          },
        },
      },
    ];
  }

  /**
   * Determines if the quick fix should be available.
   *
   * @param program - Parsed Eligian program AST
   * @returns true if quick fix should be shown, false otherwise
   */
  private shouldProvideQuickFix(program: Program): boolean {
    // Quick fix is available if:
    // 1. At least one labels import exists
    // 2. No language block exists

    // Safety check: program.statements might be undefined during early initialization
    if (!program.statements) {
      return false;
    }

    const hasLocalesImport = program.statements.some(
      stmt => isDefaultImport(stmt) && stmt.type === 'locales'
    );
    const hasLanguageBlock = program.languages !== undefined;

    return hasLocalesImport && !hasLanguageBlock;
  }

  /**
   * Extracts locales file paths from import statements.
   *
   * @param program - Parsed Eligian program AST
   * @returns Array of locales file paths
   */
  private extractLocalesFilePaths(program: Program): string[] {
    // Safety check: program.statements might be undefined during early initialization
    if (!program.statements) {
      return [];
    }

    return program.statements
      .filter(stmt => isDefaultImport(stmt) && stmt.type === 'locales')
      .map(stmt => (isDefaultImport(stmt) ? stmt.path : ''))
      .filter((path): path is string => path.length > 0);
  }

  /**
   * Collects all unique language codes from multiple labels files.
   *
   * @param filePaths - Array of labels file paths (relative to source file)
   * @param sourceDir - Directory containing the source .eligian file
   * @param readFile - Function to read file contents
   * @returns Array of LanguageCodeInfo objects (sorted alphabetically, deduplicated)
   */
  private async collectLanguageCodes(
    filePaths: string[],
    sourceDir: string,
    readFile: (path: string) => Promise<string>
  ): Promise<LanguageCodeInfo[]> {
    const allLanguageCodes = new Set<string>();

    for (const filePath of filePaths) {
      try {
        // Resolve relative path to absolute
        const absolutePath = resolve(sourceDir, filePath);
        const content = await readFile(absolutePath);
        const parsed = this.labelsParser.extractLanguageCodes(filePath, content);

        if (parsed.success) {
          for (const code of parsed.languageCodes) {
            allLanguageCodes.add(code);
          }
        }
      } catch (error) {
        // Silently handle file read errors - will generate template instead
        console.debug(`Failed to read labels file ${filePath}:`, error);
      }
    }

    // Convert to LanguageCodeInfo array (sorted alphabetically)
    const sortedCodes = Array.from(allLanguageCodes).sort();

    return sortedCodes.map(code => ({
      code,
      isDefault: false, // Generator will determine default based on alphabetical order
    }));
  }
}
