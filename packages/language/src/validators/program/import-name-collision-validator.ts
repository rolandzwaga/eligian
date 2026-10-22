import type { ValidationAcceptor } from 'langium';
import { OPERATION_REGISTRY } from '../../compiler/index.js';
import type { ActionImport, LibraryImport, Program } from '../../generated/ast.js';
import { isLibraryImport } from '../../generated/ast.js';
import { isNamedImport } from '../../utils/ast-helpers.js';
import { formatValidationMessage } from '../../utils/error-builder.js';
import { getElements, getImports } from '../../utils/program-helpers.js';
import { BaseValidator } from '../base-validator.js';
import { validateImportName } from '../import-name-validator.js';
import { RESERVED_KEYWORDS } from '../validation-constants.js';

/**
 * Report imported action names (alias applied) that are imported twice or that
 * collide with an action defined in the importing document. Shared by Program
 * and Library roots: a library that defines `fade` and also imports `fade`
 * would otherwise silently resolve its own calls to one of the two.
 */
export function reportImportNameCollisions(
  libraryImports: readonly LibraryImport[],
  localActionNames: ReadonlySet<string>,
  accept: ValidationAcceptor
): void {
  const finalNameOf = (actionImport: ActionImport) =>
    // Use alias if provided, otherwise use original action name
    actionImport.alias || actionImport.action.$refText || '';

  // Check for duplicate imports
  const importedNames = new Set<string>();
  for (const stmt of libraryImports) {
    for (const actionImport of stmt.actions) {
      const finalName = finalNameOf(actionImport);
      if (importedNames.has(finalName)) {
        accept('error', `Duplicate import: action '${finalName}' is already imported`, {
          node: actionImport,
          property: actionImport.alias ? 'alias' : 'action',
          code: 'import_name_collision',
        });
      } else {
        importedNames.add(finalName);
      }
    }
  }

  // Check for conflicts with locally-defined actions
  for (const stmt of libraryImports) {
    for (const actionImport of stmt.actions) {
      const finalName = finalNameOf(actionImport);
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
 * Program-level import-name validations: named-import uniqueness/reserved-word
 * checks and library-import name-collision detection.
 */
export class ProgramImportNameValidator extends BaseValidator {
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
   * T043: US2 - Validate no name collisions
   *
   * Imported actions (with or without aliases) must not conflict with:
   * - Locally-defined actions
   * - Other imported actions from the same or different libraries
   * - Built-in operations (handled by checkActionNameCollision)
   *
   * Library roots get the same check from ImportValidator.checkLibraryImportNameCollisions.
   */
  checkImportNameCollisions(program: Program, accept: ValidationAcceptor): void {
    // Anti-pattern fix: previously a `LibraryImport`-level check that re-scanned
    // every import statement on each invocation — O(N²) over N library imports
    // and emitting each duplicate-import diagnostic once per import. Running once
    // at the Program level scans all imports a single time.
    const libraryImports = program.statements.filter(isLibraryImport);
    if (libraryImports.length === 0) {
      return;
    }

    const localActionNames = new Set(
      getElements(program)
        .filter(
          el => el.$type === 'RegularActionDefinition' || el.$type === 'EndableActionDefinition'
        )
        .map(action => action.name)
    );
    reportImportNameCollisions(libraryImports, localActionNames, accept);
  }
}
