import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ValidationAcceptor } from 'langium';
import { URI } from 'vscode-uri';
import { hasImports, loadProgramAssets } from '../../asset-loading/compiler-integration.js';
import { MISSING_LABELS_FILE_CODE } from '../../eligian-validator.js';
import type { Program } from '../../generated/ast.js';
import { extractTranslationKeys } from '../../locales/translation-key-extractor.js';
import type { MissingLabelsFileData } from '../../types/code-actions.js';
import { isDefaultImport, isNamedImport } from '../../utils/ast-helpers.js';
import { formatValidationMessage } from '../../utils/error-builder.js';
import {
  resolveImportPathToUri,
  resolveImportRelativePath,
  stripImportQuotes,
} from '../../utils/path-utils.js';
import { getImports } from '../../utils/program-helpers.js';
import { BaseValidator } from '../base-validator.js';

/**
 * Asynchronously check whether a file exists, without throwing.
 *
 * B25: used in place of the synchronous `fs.existsSync` inside validation
 * checks so the LSP event loop is not blocked on disk access.
 */
async function fileExistsAsync(absolutePath: string): Promise<boolean> {
  try {
    await fs.promises.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Program-level asset-import validations: file existence + HTML/CSS syntax,
 * CSS import registration, and locales import loading/validation.
 */
export class ProgramAssetImportValidator extends BaseValidator {
  /**
   * Feature 010: Asset Loading & Validation - LSP Integration
   *
   * Loads and validates all assets referenced in import statements.
   * Reports file existence, HTML syntax, and CSS syntax errors.
   *
   * Constitution Principle X: Compiler-First Validation
   * - Uses loadProgramAssets() from asset-loading module
   * - Langium validator is thin adapter
   */
  checkAssetLoading(program: Program, accept: ValidationAcceptor): void {
    // Skip if no imports
    if (!hasImports(program)) {
      return;
    }

    // Get source file path from document URI
    const filePath = program.$document?.uri?.fsPath;
    if (!filePath) {
      // No file path available (e.g., in-memory document during tests)
      // Skip asset validation for in-memory documents
      return;
    }

    // Validate that filePath is a valid absolute path
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      // Invalid file path - skip validation
      return;
    }

    // Skip asset validation for test documents
    // 1. parseHelper documents: /1.eligian, /2.eligian (simple numeric names)
    // 2. compiler test documents: /memory/source-1.eligian, /memory/source-2.eligian
    const fileName = filePath.split(/[/\\]/).pop() ?? '';
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (/^\d+\.eligian$/.test(fileName) || normalizedPath.includes('/memory/')) {
      // Test document - skip asset validation
      return;
    }

    try {
      // Load and validate assets
      const result = loadProgramAssets(program, filePath);

      // Report validation errors
      for (const error of result.errors) {
        // Find the import statement that caused this error
        const imports = getImports(program);
        const importStmt = imports.find(
          imp =>
            (isDefaultImport(imp) && imp.path === error.filePath) ||
            (isNamedImport(imp) && imp.path === error.filePath)
        );

        if (importStmt) {
          accept('error', formatValidationMessage(error.message, error.hint), {
            node: importStmt,
            property: 'path',
          });
        }
      }
    } catch (_err) {
      // Catch any errors from asset loading to prevent extension crash
      // Errors during asset loading should not crash the LSP
      // console.error('[Asset Validator] Error loading assets:', _err);
    }
  }

  /**
   * Feature 013 - T016: Extract CSS imports and register with CSS registry
   * Feature 013 - T026: Validate CSS file errors
   *
   * This validator runs on every Program node and:
   * 1. Extracts all CSS import statements (DefaultImport with type='styles')
   * 2. Resolves CSS file paths relative to document URI
   * 3. Registers imports with CSSRegistryService for className validation
   * 4. Validates that imported CSS files don't have syntax errors (T026)
   *
   * Note: Actual CSS file parsing happens via LSP notifications (see main.ts)
   */
  checkCSSImports(program: Program, accept: ValidationAcceptor): void {
    if (!this.services) return;

    const documentUri = program.$document?.uri?.toString();
    if (!documentUri) return;

    // Register CSS imports using the helper method
    this.ensureCSSImportsRegistered(program, documentUri);

    // T026: Validate CSS file errors
    this.validateCSSFileErrors(program, accept);
  }

  /**
   * Feature 013 - T026 [US4]: Validate that imported CSS files don't have syntax errors
   *
   * For each imported CSS file, check if it has parse errors and report them at the
   * import statement location.
   *
   * @param program - AST Program node
   * @param accept - Validation acceptor for reporting errors
   */
  private validateCSSFileErrors(program: Program, accept: ValidationAcceptor): void {
    if (!this.services) return;

    const cssRegistry = this.services.css.CSSRegistry;
    const documentUri = program.$document?.uri?.toString();
    if (!documentUri) return;

    // Get all CSS imports for this document
    const cssImports = getImports(program)
      .filter(isDefaultImport)
      .filter(imp => imp.type === 'styles');

    for (const cssImport of cssImports) {
      if (!cssImport.path) {
        continue;
      }
      const cssPath = stripImportQuotes(cssImport.path); // Unquoted path for display

      // Resolve to absolute URI to match registry keys (D4: shared resolution)
      const cssFileUri = resolveImportPathToUri(documentUri, cssImport.path);

      // Check if CSS file has errors (using absolute URI)
      if (cssRegistry.hasErrors(cssFileUri)) {
        const errors = cssRegistry.getErrors(cssFileUri);

        // Report error at the import statement
        if (errors.length > 0) {
          const firstError = errors[0];
          const errorMessage = `CSS file '${cssPath}' has syntax errors (line ${firstError.line}, column ${firstError.column}): ${firstError.message}`;

          accept('error', errorMessage, {
            node: cssImport,
            property: 'path',
            data: {
              code: 'invalid_css_file',
            },
          });
        }
      }
    }
  }

  /**
   * Feature 045: Extract and register locales imports
   *
   * Detects locales imports in the program, loads the locales JSON file,
   * extracts translation key metadata, and populates the locale registry.
   * This enables translation key validation in operation parameters.
   *
   * TODO: Full implementation in Phase 3 (US1)
   *
   * @param program - AST Program node
   * @param accept - Validation acceptor for reporting errors
   */
  async checkLocalesImports(program: Program, accept: ValidationAcceptor): Promise<void> {
    if (!this.services) return;

    const documentUri = program.$document?.uri?.toString();
    if (!documentUri) return;

    // Find locales imports (type='locales')
    const localesImports = getImports(program)
      .filter(isDefaultImport)
      .filter(imp => imp.type === 'locales');

    // If no locales imports, return early
    if (localesImports.length === 0) {
      return;
    }

    // Feature 045: Validate that languages block exists when locales are imported
    if (!program.languages) {
      for (const localesImport of localesImports) {
        accept(
          'error',
          'Locales import requires a languages block to declare available languages.',
          {
            node: localesImport,
          }
        );
      }
      return; // Don't process locales without languages block
    }

    // Resolve locales file path
    const docDir = path.dirname(URI.parse(documentUri).fsPath);

    for (const localesImport of localesImports) {
      if (!localesImport.path) continue;

      const localesPath = stripImportQuotes(localesImport.path); // Unquoted path for display
      // D4: shared resolution (path.join handles ./, ., ../)
      const absolutePath = resolveImportRelativePath(localesImport.path, docDir);

      // B25: probe existence asynchronously so the LSP validation cycle never
      // blocks the event loop on synchronous disk I/O.
      const exists = await fileExistsAsync(absolutePath);

      // Check if locales file exists
      if (!exists) {
        // Extract language codes from languages block if present
        const languageCodes = program.languages?.entries?.map(entry => entry.code) || [];
        const hasLanguagesBlock = !!program.languages;

        // Create diagnostic data for code action
        const diagnosticData: MissingLabelsFileData = {
          importPath: localesPath,
          resolvedPath: absolutePath,
          hasLanguagesBlock,
          languageCodes,
        };

        // Report missing file with diagnostic code for quick fix
        accept('error', `Locales file not found: ${localesPath}`, {
          node: localesImport,
          code: MISSING_LABELS_FILE_CODE, // Reuse existing code for now
          data: diagnosticData,
        });
        continue;
      }

      // Feature 045 Phase 3 - Load locale file, extract keys, populate registry
      try {
        const content = await fs.promises.readFile(absolutePath, 'utf-8');
        const localeData = JSON.parse(content);

        // Extract translation keys from locale data
        const translationKeys = extractTranslationKeys(localeData);

        // Populate the label registry with extracted keys
        const labelRegistry = this.services.labels.LabelRegistry;
        const fileUri = URI.file(absolutePath).toString();
        labelRegistry.updateLabelsFile(fileUri, translationKeys);
        labelRegistry.registerImports(documentUri, fileUri);
      } catch (e) {
        // JSON parse errors or other issues - report as warning
        const errorMessage = e instanceof Error ? e.message : String(e);
        accept('warning', `Failed to parse locales file: ${errorMessage}`, {
          node: localesImport,
        });
      }
    }
  }
}
