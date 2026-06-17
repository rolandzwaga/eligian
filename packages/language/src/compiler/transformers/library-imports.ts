/**
 * Library import resolution for the AST transformer.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import { AstUtils, type URI } from 'langium';
import type { TransformError } from '../../errors/index.js';
import type { ActionDefinition, Library, Program } from '../../generated/ast.js';
import { isLibrary, isLibraryImport } from '../../generated/ast.js';
import { getLibraryImports } from '../../utils/program-helpers.js';
import { getOrCreateServices, resolveLibraryPath } from '../pipeline.js';

/**
 * Resolve a library import path to its loaded {@link Library} document, applying
 * cycle detection.
 *
 * Shared by {@link resolveImports} and {@link resolveLibraryImports}, which both
 * performed the identical resolve-path → cycle-check → `getDocument` → `isLibrary`
 * sequence before diverging in how they collect actions. Returns `undefined`
 * when the target has already been visited, the document is not loaded, or it is
 * not a library — matching the skip semantics of both call sites.
 *
 * @param fromUri - URI of the document/library doing the importing
 * @param importPath - The library import's path string
 * @param visited - Set of already-visited library fsPaths (cycle guard)
 * @returns The resolved library and its URI, or `undefined` to skip
 */
function resolveLibraryDocument(
  fromUri: URI,
  importPath: string,
  visited: Set<string>
): { library: Library; uri: URI } | undefined {
  const libraryUri = resolveLibraryPath(fromUri, importPath);
  if (visited.has(libraryUri.fsPath)) {
    return undefined;
  }

  const services = getOrCreateServices();
  const libraryDoc = services.shared.workspace.LangiumDocuments.getDocument(libraryUri);
  const value = libraryDoc?.parseResult.value;
  if (!value || !isLibrary(value)) {
    return undefined;
  }

  return { library: value, uri: libraryUri };
}

/**
 * T044: Resolve library imports and collect imported actions (Feature 023 - User Story 2)
 *
 * This function processes all LibraryImport statements in a program and collects the imported actions.
 * It handles aliasing - if an action is imported with an alias, it returns the action with the alias name
 * applied so that downstream compilation uses the alias.
 *
 * Note: This relies on Langium's cross-reference resolution to already have resolved ActionImport.action
 * references to actual ActionDefinition nodes from library files. If references are unresolved,
 * those imports will be skipped (validation should have caught these errors).
 *
 * @param program - Program AST node with potential library imports
 * @returns Array of ActionDefinition nodes (with aliases applied where necessary)
 */
export function resolveImports(
  program: Program,
  visited: Set<string> = new Set()
): Effect.Effect<ActionDefinition[], TransformError, never> {
  return Effect.gen(function* () {
    const libraryImports = getLibraryImports(program);
    const importedActions: ActionDefinition[] = [];

    // Track visited libraries to prevent infinite recursion
    const currentUri = AstUtils.getDocument(program).uri;
    if (currentUri) {
      visited.add(currentUri.fsPath);
    }

    for (const libraryImport of libraryImports) {
      // Feature 032 US3: Get the library document to recursively collect its imports
      if (currentUri) {
        const resolved = resolveLibraryDocument(currentUri, libraryImport.path, visited);
        if (resolved) {
          // Recursively collect actions from library's imports
          const nestedActions = yield* resolveLibraryImports(
            resolved.library,
            visited,
            resolved.uri
          );
          importedActions.push(...nestedActions);
        }
      }

      for (const actionImport of libraryImport.actions) {
        // Get the resolved ActionDefinition from the reference
        // If the reference is unresolved (undefined), skip it - validation should have caught this
        const actionDef = actionImport.action.ref;
        if (!actionDef) {
          // Reference not resolved - skip (validation error should exist)
          continue;
        }

        // T045: Handle aliasing - if action has alias, create a modified action with alias name
        if (actionImport.alias) {
          // Create a new action object with the alias name
          // We need to preserve all other properties but change the name
          const aliasedAction: ActionDefinition = {
            ...actionDef,
            name: actionImport.alias,
          };
          importedActions.push(aliasedAction);
        } else {
          importedActions.push(actionDef);
        }
      }
    }

    return importedActions;
  });
}

/**
 * Feature 032 US3: Recursively resolve library imports
 *
 * Collects all actions from a library's imports, including nested library imports.
 * This ensures that actions defined in libraries can call actions from libraries
 * that those libraries import.
 */
function resolveLibraryImports(
  library: Library,
  visited: Set<string>,
  libraryUri: URI
): Effect.Effect<ActionDefinition[], TransformError, never> {
  return Effect.gen(function* () {
    const importedActions: ActionDefinition[] = [];

    // Mark this library as visited
    visited.add(libraryUri.fsPath);

    // Get library's imports
    const libraryImports = library.imports || [];

    for (const libraryImport of libraryImports) {
      if (!isLibraryImport(libraryImport)) continue;

      // Resolve nested library (path resolution + cycle check + library document lookup)
      const resolved = resolveLibraryDocument(libraryUri, libraryImport.path, visited);
      if (!resolved) continue;

      const nestedLibrary = resolved.library;

      // Recursively collect actions from nested library's imports
      const transitiveActions = yield* resolveLibraryImports(nestedLibrary, visited, resolved.uri);
      importedActions.push(...transitiveActions);

      // Feature 032 US3: Add ALL actions from the nested library
      // This ensures library A can use actions from library B (like slideAndFade)
      // Library A's actions are transformed with access to all of B's actions
      for (const action of nestedLibrary.actions || []) {
        importedActions.push(action);
      }
    }

    return importedActions;
  });
}
