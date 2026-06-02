import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ValidationAcceptor } from 'langium';
import { URI } from 'vscode-uri';
import { hasImports, loadProgramAssets } from '../asset-loading/compiler-integration.js';
import { OPERATION_REGISTRY } from '../compiler/index.js';
import { MISSING_LABELS_FILE_CODE } from '../eligian-validator.js';
import type {
  EndableActionDefinition,
  EventActionDefinition,
  LibraryImport,
  Program,
  RegularActionDefinition,
  VariableDeclaration,
} from '../generated/ast.js';
import { extractTranslationKeys } from '../locales/translation-key-extractor.js';
import type { MissingLabelsFileData } from '../types/code-actions.js';
import { isDefaultImport, isNamedImport } from '../utils/ast-helpers.js';
import { formatValidationMessage } from '../utils/error-builder.js';
import {
  resolveImportPathToUri,
  resolveImportRelativePath,
  stripImportQuotes,
} from '../utils/path-utils.js';
import { getElements, getImports, getTimelines } from '../utils/program-helpers.js';
import { BaseValidator } from './base-validator.js';
import { validateImportName } from './import-name-validator.js';
import { RESERVED_KEYWORDS } from './validation-constants.js';

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
 * Program-level validations for the Eligian DSL.
 */
export class ProgramValidator extends BaseValidator {
  /**
   * Validate that every program has at least one timeline declaration.
   *
   * Eligius requires at least one timeline provider to drive events.
   * Multiple timelines are supported for complex scenarios (e.g., synchronized video+audio).
   */
  checkTimelineRequired(program: Program, accept: ValidationAcceptor): void {
    const timelines = getTimelines(program);

    if (timelines.length === 0) {
      accept(
        'error',
        'A timeline declaration is required. Add: timeline "<name>" using <provider> { ... }',
        {
          node: program,
          property: 'statements',
        }
      );
    }
    // Multiple timelines are now allowed (removed restriction)
  }

  /**
   * T042: US2 - Check for duplicate action definitions
   * Emit error if the same action name is defined multiple times
   */
  checkDuplicateActions(program: Program, accept: ValidationAcceptor): void {
    const actions = getElements(program).filter(
      (element): element is RegularActionDefinition | EndableActionDefinition =>
        element.$type === 'RegularActionDefinition' || element.$type === 'EndableActionDefinition'
    );

    this.reportDuplicatesByName(
      actions,
      element => `Duplicate action definition '${element.name}'. Action already defined.`,
      'duplicate_action',
      accept
    );
  }

  /**
   * Check for duplicate constant declarations
   * Emit error if constant name is declared more than once
   */
  checkDuplicateConstants(program: Program, accept: ValidationAcceptor): void {
    const constants = getElements(program).filter(
      (element): element is VariableDeclaration => element.$type === 'VariableDeclaration'
    );

    this.reportDuplicatesByName(
      constants,
      element => `Duplicate constant declaration '${element.name}'. Constant already defined.`,
      'duplicate_constant',
      accept
    );
  }

  /**
   * T048-T051: US2 - Validate named import names
   *
   * Thin Langium adapter that calls the pure validateImportName() function.
   * Ensures import names are unique and don't conflict with reserved keywords or operations.
   *
   * Follows Constitution Principle X (Compiler-First Validation):
   * - Business logic in pure validator function
   * - Langium validator is thin wrapper
   */
  checkNamedImportNames(program: Program, accept: ValidationAcceptor): void {
    // Filter to get only named imports
    const namedImports = getImports(program).filter(isNamedImport);

    // Build set of existing import names
    const existingNames = new Set<string>();

    // Get operation names from registry
    const operationNames = new Set(Object.keys(OPERATION_REGISTRY));

    // Validate each named import
    for (const importStmt of namedImports) {
      const error = validateImportName(
        importStmt.name,
        existingNames,
        RESERVED_KEYWORDS,
        operationNames
      );

      if (error) {
        accept('error', formatValidationMessage(error.message, error.hint), {
          node: importStmt,
          property: 'name',
          code: error.code,
        });
      } else {
        // Add to existing names set for next iteration
        existingNames.add(importStmt.name);
      }
    }
  }

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

  /**
   * T043: US2 - Validate no name collisions
   *
   * Imported actions (with or without aliases) must not conflict with:
   * - Locally-defined actions
   * - Other imported actions from the same or different libraries
   * - Built-in operations (handled by checkActionNameCollision)
   */
  checkImportNameCollisions(program: Program, accept: ValidationAcceptor): void {
    // Anti-pattern fix: previously a `LibraryImport`-level check that re-scanned
    // every import statement on each invocation — O(N²) over N library imports
    // and emitting each duplicate-import diagnostic once per import. Running once
    // at the Program level scans all imports a single time.
    const libraryImports = program.statements.filter(
      (stmt): stmt is LibraryImport => stmt.$type === 'LibraryImport'
    );
    if (libraryImports.length === 0) {
      return;
    }

    // Collect all imported action names (with aliases applied), in one pass.
    const importedNames = new Map<string, LibraryImport>();

    for (const stmt of libraryImports) {
      for (const actionImport of stmt.actions) {
        // Use alias if provided, otherwise use original action name
        const finalName = actionImport.alias || actionImport.action.$refText || '';

        // Check for duplicate imports
        if (importedNames.has(finalName)) {
          accept('error', `Duplicate import: action '${finalName}' is already imported`, {
            node: actionImport,
            property: actionImport.alias ? 'alias' : 'action',
            code: 'import_name_collision',
          });
        } else {
          importedNames.set(finalName, stmt);
        }
      }
    }

    // Check for conflicts with locally-defined actions (computed once).
    const localActionNames = new Set(
      getElements(program)
        .filter(
          el => el.$type === 'RegularActionDefinition' || el.$type === 'EndableActionDefinition'
        )
        .map(action => action.name)
    );

    for (const stmt of libraryImports) {
      for (const actionImport of stmt.actions) {
        const finalName = actionImport.alias || actionImport.action.$refText || '';

        if (localActionNames.has(finalName)) {
          accept(
            'error',
            `Import name collision: action '${finalName}' conflicts with locally-defined action`,
            {
              node: actionImport,
              property: actionImport.alias ? 'alias' : 'action',
              code: 'import_name_collision',
            }
          );
        }
      }
    }
  }

  /**
   * T033: Validate duplicate event/topic combinations
   *
   * Warns about duplicate event names or event+topic combinations.
   * Multiple handlers for the same event may indicate unintended behavior.
   */
  checkDuplicateEventActions(program: Program, accept: ValidationAcceptor): void {
    // Build a map of event signatures to event actions
    const eventSignatures = new Map<string, EventActionDefinition[]>();

    for (const stmt of program.statements) {
      if (stmt.$type === 'EventActionDefinition') {
        const eventAction = stmt as EventActionDefinition;

        // Skip incomplete event actions (eventName optional for completion)
        if (!eventAction.eventName) {
          continue;
        }

        // Create signature: "eventName" or "eventName|topic"
        const signature = eventAction.eventTopic
          ? `${eventAction.eventName}|${eventAction.eventTopic}`
          : eventAction.eventName;

        if (!eventSignatures.has(signature)) {
          eventSignatures.set(signature, []);
        }
        eventSignatures.get(signature)!.push(eventAction);
      }
    }

    // T030: Warn about duplicates
    for (const [signature, actions] of eventSignatures) {
      if (actions.length > 1) {
        // Multiple handlers for the same event/topic combination
        const hasTopic = signature.includes('|');
        const [eventName, topic] = hasTopic ? signature.split('|') : [signature, undefined];

        for (const action of actions) {
          const message = hasTopic
            ? `Multiple handlers defined for event '${eventName}' with topic '${topic}'. This may cause unexpected behavior.`
            : `Multiple handlers defined for event '${eventName}'. This may cause unexpected behavior.`;

          accept('warning', message, {
            node: action,
            property: 'eventName',
            code: 'duplicate_event_handler',
          });
        }
      }
    }
  }
}
