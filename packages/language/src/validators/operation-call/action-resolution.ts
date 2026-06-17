import type { ActionDefinition, Program } from '../../generated/ast.js';
import { isLibraryImport } from '../../generated/ast.js';

/**
 * Feature 032 Fix: Find imported action by name or alias.
 *
 * Checks if the given name matches either:
 * - The original action name (from library)
 * - An alias used when importing the action
 *
 * Shared by {@link OperationExistenceValidator} and {@link ParameterValidator}
 * (extracted from the former `OperationCallValidator` so both check families can
 * resolve action calls without duplicating the alias-map walk).
 *
 * @param callName - Name used in OperationCall (could be alias)
 * @param program - Program containing import statements
 * @param importedActions - List of imported action definitions
 * @returns ActionDefinition if found, undefined otherwise
 */
export function findImportedActionByNameOrAlias(
  callName: string,
  program: Program,
  importedActions: ActionDefinition[]
): ActionDefinition | undefined {
  // Build a map of all import aliases: alias → action
  const aliasMap = new Map<string, ActionDefinition>();

  // Get all library imports from the program
  const statements = program.statements || [];
  const libraryImports = statements.filter(isLibraryImport);

  for (const libraryImport of libraryImports) {
    for (const actionImport of libraryImport.actions) {
      const action = actionImport.action.ref;
      if (!action) continue;

      // Register the alias if present
      if (actionImport.alias) {
        aliasMap.set(actionImport.alias, action);
      }
    }
  }

  // First, check if callName is an alias
  const actionByAlias = aliasMap.get(callName);
  if (actionByAlias) {
    return actionByAlias;
  }

  // Otherwise, check if callName matches an original action name
  return importedActions.find(action => action.name === callName);
}
