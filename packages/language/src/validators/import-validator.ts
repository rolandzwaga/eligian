import { AstUtils, type LangiumDocument, UriUtils, type ValidationAcceptor } from 'langium';
import { hasOperation } from '../compiler/index.js';
import { libraryPathKey } from '../compiler/pipeline/library-loader.js';
import { resolveLibraryPath } from '../compiler/pipeline.js';
import { findSimilarClasses } from '../css/levenshtein.js';
import type { DefaultImport, Library, LibraryImport, NamedImport } from '../generated/ast.js';
import { isLibrary, isLibraryImport } from '../generated/ast.js';
import { getLibraryImportsOf } from '../utils/action-scope.js';
import { formatValidationMessage } from '../utils/error-builder.js';
import { validateAssetType } from './asset-type-validator.js';
import { BaseValidator } from './base-validator.js';
import { validateImportPath } from './import-path-validator.js';
import { reportImportNameCollisions } from './program/import-name-collision-validator.js';

/**
 * Validations for library imports and import statements (Feature 009/023).
 */
export class ImportValidator extends BaseValidator {
  /**
   * T021-T024: US1 - Validate library content constraints
   *
   * Libraries contain action definitions, optionally preceded by library
   * imports (`import { a } from "./other.eligian"`, Feature 032). They cannot contain:
   * - Timelines (library files are for reusable actions, not timeline execution)
   * - Asset imports (styles/layout/provider/locales/named asset imports)
   * - Constants (libraries only define actions)
   *
   * Library imports are checked separately (file exists, actions exist and are
   * public, name collisions, circular imports).
   *
   * This validator checks the library's actions array for non-action elements.
   * Since the grammar already prevents most invalid content, this validator
   * catches edge cases where elements might be added programmatically.
   */
  checkLibraryContent(library: Library, accept: ValidationAcceptor): void {
    // Note: The grammar already restricts libraries to only contain actions,
    // so this validator is primarily defensive and for future-proofing.
    // If we later allow other constructs in the grammar, this will catch them.

    // Verify library only has actions (grammar enforces this, but double-check)
    if (!library.actions) {
      return; // Empty library is valid
    }

    // All items in library.actions array should be ActionDefinition nodes
    // (either RegularActionDefinition or EndableActionDefinition)
    for (const action of library.actions) {
      if (
        action.$type !== 'RegularActionDefinition' &&
        action.$type !== 'EndableActionDefinition'
      ) {
        accept('error', `Library files can only contain action definitions.`, {
          node: action,
          code: 'library_invalid_content',
        });
      }
    }
  }

  /**
   * T025: US1 - Validate unique action names within library
   *
   * Each library must have unique action names. Duplicate names would cause
   * ambiguity when importing actions.
   */
  checkLibraryDuplicateActions(library: Library, accept: ValidationAcceptor): void {
    this.reportDuplicatesByName(
      library.actions || [],
      action =>
        `Duplicate action definition '${action.name}'. Action already defined in this library.`,
      'library_duplicate_action',
      accept
    );
  }

  /**
   * Library imports must not collide with the library's own actions or with
   * each other (same rule as for programs, `import_name_collision`). Without
   * this, a library that defines `fade` and also imports `fade` would silently
   * resolve its own calls to one of the two.
   */
  checkLibraryImportNameCollisions(library: Library, accept: ValidationAcceptor): void {
    const libraryImports = (library.imports ?? []).filter(isLibraryImport);
    if (libraryImports.length === 0) {
      return;
    }
    reportImportNameCollisions(
      libraryImports,
      new Set((library.actions ?? []).map(action => action.name)),
      accept
    );
  }

  /**
   * T041: US2 - Validate library file exists
   *
   * Library imports must reference valid .eligian files. This validator checks that
   * the imported library file exists and can be loaded by Langium's document loader.
   */
  checkImportFileExists(libraryImport: LibraryImport, accept: ValidationAcceptor): void {
    if (!this.services || !libraryImport.path) {
      // No services, or no path yet (Langium error recovery while typing
      // `import { a } from`): the parse error is already reported.
      return;
    }

    const document = AstUtils.getDocument(libraryImport);
    const documentUri = document.uri;
    if (!documentUri) {
      return; // Cannot resolve relative paths without document URI
    }

    // Resolve the library path using same logic as pipeline.ts and scope provider
    const originalPath = libraryImport.path;
    const resolvedUri = resolveLibraryPath(documentUri, originalPath);

    // Try to load the library document
    const documents = this.services.shared.workspace.LangiumDocuments;
    const libraryDocument = documents.getDocument(resolvedUri);

    if (!libraryDocument) {
      accept('error', `Library file not found: '${originalPath}'`, {
        node: libraryImport,
        property: 'path',
        code: 'import_file_not_found',
      });
    }
  }

  /**
   * Libraries must not import each other in a cycle (the compiler rejects it with
   * "Circular dependency detected"; the scope provider silently cuts the cycle).
   *
   * - In a library, an import is reported when its chain leads back to the
   *   importing library itself (each library in the cycle reports its own import,
   *   libraries merely upstream of a cycle report nothing).
   * - In a program, an import is reported when any cycle is reachable from it,
   *   since compiling the program fails on that cycle.
   */
  checkCircularLibraryImport(libraryImport: LibraryImport, accept: ValidationAcceptor): void {
    if (!this.services || !libraryImport.path) {
      return;
    }
    const document = AstUtils.getDocument(libraryImport);
    if (!document.uri) {
      return;
    }
    const documents = this.services.shared.workspace.LangiumDocuments;
    const target = documents.getDocument(resolveLibraryPath(document.uri, libraryImport.path));
    if (!target) {
      return; // Missing library: reported by checkImportFileExists
    }

    const inLibrary = isLibrary(document.parseResult.value);
    const cycle = findLibraryImportCycle(
      target,
      uri => documents.getDocument(uri),
      inLibrary ? document : undefined
    );
    if (!cycle) {
      return;
    }
    const chain = cycle.join(' → ');
    const message = inLibrary
      ? `Circular library import: ${chain}`
      : `Imported library '${libraryImport.path}' has a circular import: ${chain}`;
    accept(
      'error',
      formatValidationMessage(message, 'Remove one of the imports to break the cycle'),
      { node: libraryImport, property: 'path', code: 'circular_library_import' }
    );
  }

  /**
   * Resolve a library import to its parsed `Library` AST node.
   *
   * Shared by `checkImportedActionsExist` and `checkImportedActionsPublic`. Uses the
   * project-wide `resolveLibraryPath()` (the same resolution as `checkImportFileExists`,
   * the compiler pipeline, and the scope provider) so workspace-loaded documents resolve
   * consistently on Windows and percent-encoded paths.
   *
   * Returns `undefined` when services are unavailable, the document URI cannot be
   * determined, the library document is not loaded (already reported by
   * `checkImportFileExists`), or the resolved file is not a library.
   */
  private resolveLibraryNode(libraryImport: LibraryImport): Library | undefined {
    if (!this.services || !libraryImport.path) {
      return undefined; // No services, or no path yet (partial AST while typing)
    }

    const document = AstUtils.getDocument(libraryImport);
    const documentUri = document.uri;
    if (!documentUri) {
      return undefined;
    }

    const resolvedUri = resolveLibraryPath(documentUri, libraryImport.path);
    const documents = this.services.shared.workspace.LangiumDocuments;
    const libraryDocument = documents.getDocument(resolvedUri);

    if (!libraryDocument) {
      return undefined; // File not found - already reported by checkImportFileExists
    }

    const library = libraryDocument.parseResult.value;
    if (library.$type !== 'Library') {
      return undefined; // Not a library file - skip validation
    }

    return library as Library;
  }

  /**
   * T042 + T042a: US2 - Validate imported actions exist in library
   *
   * All imported actions must exist in the target library. This validator checks each
   * action import and provides "Did you mean?" suggestions for typos using Levenshtein distance.
   */
  checkImportedActionsExist(libraryImport: LibraryImport, accept: ValidationAcceptor): void {
    const libraryNode = this.resolveLibraryNode(libraryImport);
    if (!libraryNode) {
      return;
    }

    const originalPath = libraryImport.path;
    const availableActions = libraryNode.actions?.map(a => a.name) || [];

    // Check each imported action
    for (const actionImport of libraryImport.actions) {
      const actionName = actionImport.action.$refText || '';

      if (!availableActions.includes(actionName)) {
        // Action not found - suggest similar names using Levenshtein distance
        const suggestions = findSimilarClasses(actionName, new Set(availableActions));
        const suggestionText =
          suggestions.length > 0 ? ` (Did you mean: ${suggestions.join(', ')}?)` : '';

        accept(
          'error',
          `Action '${actionName}' does not exist in library '${originalPath}'${suggestionText}`,
          {
            node: actionImport,
            property: 'action',
            code: 'import_action_not_found',
          }
        );
      }
    }
  }

  /**
   * T055: US3 - Validate imported actions are public (not private)
   *
   * Private actions in library files cannot be imported. This enforces encapsulation
   * and allows library authors to hide implementation details from consumers.
   *
   * This validator checks each imported action and ensures it's not marked as private
   * in the library file.
   */
  checkImportedActionsPublic(libraryImport: LibraryImport, accept: ValidationAcceptor): void {
    const libraryNode = this.resolveLibraryNode(libraryImport);
    if (!libraryNode) {
      return;
    }

    const originalPath = libraryImport.path;
    const libraryActions = libraryNode.actions || [];

    // Check each imported action for private visibility
    for (const actionImport of libraryImport.actions) {
      const actionName = actionImport.action.$refText || '';

      // Find the action in the library
      const action = libraryActions.find(a => a.name === actionName);

      if (action && action.visibility === 'private') {
        // Attempting to import a private action - report error
        accept(
          'error',
          `Cannot import private action '${actionName}' from library '${originalPath}'`,
          {
            node: actionImport,
            property: 'action',
            code: 'import_private_action',
          }
        );
      }
    }
  }

  /**
   * T073: US5 - Check for import alias collision with built-in operations (Feature 023 - Phase 7)
   *
   * Validates that imported action aliases don't conflict with built-in operation names.
   * This prevents confusing situations where an alias shadows a built-in operation.
   */
  checkImportAliasCollision(libraryImport: LibraryImport, accept: ValidationAcceptor): void {
    for (const actionImport of libraryImport.actions) {
      // Check if alias conflicts with built-in operation
      if (actionImport.alias && hasOperation(actionImport.alias)) {
        accept(
          'error',
          `Cannot use alias '${actionImport.alias}': name conflicts with built-in operation`,
          {
            node: actionImport,
            property: 'alias',
            code: 'action_name_builtin_conflict',
          }
        );
      }
    }
  }

  /**
   * T017-T018: US5 - Validate import path is relative and portable
   *
   * Thin Langium adapter that calls the pure validateImportPath() function.
   * Follows Constitution Principle X (Compiler-First Validation):
   * - Business logic in pure validator function
   * - Langium validator is thin wrapper
   *
   * Validates both DefaultImport and NamedImport path properties.
   */
  checkImportPath(importStmt: DefaultImport | NamedImport, accept: ValidationAcceptor): void {
    const error = validateImportPath(importStmt.path);
    if (error) {
      accept('error', formatValidationMessage(error.message, error.hint), {
        node: importStmt,
        property: 'path',
        code: error.code,
      });
    }
  }

  /**
   * T067-T068: US4 - Validate asset type inference
   *
   * Thin Langium adapter that calls the pure validateAssetType() function.
   * Ensures named imports either have inferrable extensions or explicit type overrides.
   *
   * Follows Constitution Principle X (Compiler-First Validation):
   * - Business logic in pure validator function
   * - Langium validator is thin wrapper
   */
  checkAssetType(importStmt: NamedImport, accept: ValidationAcceptor): void {
    const error = validateAssetType(importStmt);

    if (error) {
      accept('error', formatValidationMessage(error.message, error.hint), {
        node: importStmt,
        property: 'path',
        code: error.code,
      });
    }
  }
}

/**
 * Depth-first search for a library import cycle reachable from `start`.
 *
 * With `through`, only a cycle that returns to `through` counts (it is placed on
 * the stack first); otherwise any cycle reachable from `start` is returned.
 * Returns the cycle as file base names (`a.eligian → b.eligian → a.eligian`), or
 * `undefined` when there is none. Documents are keyed by {@link libraryPathKey}
 * (the compiler's cycle key), so different spellings of one file compare equal.
 */
function findLibraryImportCycle(
  start: LangiumDocument,
  getDocument: (uri: LangiumDocument['uri']) => LangiumDocument | undefined,
  through?: LangiumDocument
): string[] | undefined {
  const stack: LangiumDocument[] = [];
  const onStack = new Set<string>();
  const done = new Set<string>();
  const requiredKey = through ? libraryPathKey(through.uri) : undefined;
  const names = (docs: readonly LangiumDocument[]) => docs.map(d => UriUtils.basename(d.uri));

  const visit = (doc: LangiumDocument): string[] | undefined => {
    const key = libraryPathKey(doc.uri);
    if (onStack.has(key)) {
      if (requiredKey !== undefined && key !== requiredKey) {
        return undefined; // A cycle that does not pass through `through`
      }
      const from = stack.findIndex(d => libraryPathKey(d.uri) === key);
      return names([...stack.slice(from), doc]);
    }
    const root = doc.parseResult.value;
    if (done.has(key) || !isLibrary(root)) {
      return undefined;
    }
    stack.push(doc);
    onStack.add(key);
    for (const libraryImport of getLibraryImportsOf(root)) {
      if (!libraryImport.path) {
        continue;
      }
      const next = getDocument(resolveLibraryPath(doc.uri, libraryImport.path));
      const cycle = next ? visit(next) : undefined;
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    onStack.delete(key);
    done.add(key);
    return undefined;
  };

  if (through) {
    stack.push(through);
    onStack.add(libraryPathKey(through.uri));
  }
  return visit(start);
}
