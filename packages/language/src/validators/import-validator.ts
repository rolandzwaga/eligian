import { AstUtils, type ValidationAcceptor } from 'langium';
import { hasOperation } from '../compiler/index.js';
import { resolveLibraryPath } from '../compiler/pipeline.js';
import { findSimilarClasses } from '../css/levenshtein.js';
import type { DefaultImport, Library, LibraryImport, NamedImport } from '../generated/ast.js';
import { formatValidationMessage } from '../utils/error-builder.js';
import { validateAssetType } from './asset-type-validator.js';
import { BaseValidator } from './base-validator.js';
import { validateImportPath } from './import-path-validator.js';

/**
 * Validations for library imports and import statements (Feature 009/023).
 */
export class ImportValidator extends BaseValidator {
  /**
   * T021-T024: US1 - Validate library content constraints
   *
   * Libraries can ONLY contain action definitions. They cannot contain:
   * - Timelines (library files are for reusable actions, not timeline execution)
   * - Imports (libraries cannot import from other libraries or assets)
   * - Constants (libraries only define actions)
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
   * T041: US2 - Validate library file exists
   *
   * Library imports must reference valid .eligian files. This validator checks that
   * the imported library file exists and can be loaded by Langium's document loader.
   */
  checkImportFileExists(libraryImport: LibraryImport, accept: ValidationAcceptor): void {
    if (!this.services) {
      return; // Cannot validate without services
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
    if (!this.services) {
      return undefined; // Cannot resolve without services
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
