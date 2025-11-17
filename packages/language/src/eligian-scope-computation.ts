/**
 * Feature 032 US3: Custom Scope Computation for Nested Library Imports
 *
 * Extends Langium's DefaultScopeComputation to properly export Library actions
 * to the global scope so they can be referenced across documents.
 *
 * Key insight: Langium's default scope computation only exports the root node
 * and its direct children. For Library documents, actions are nested inside
 * Library.actions array, so they don't get exported by default.
 *
 * This custom implementation ensures that:
 * 1. Library actions are exported to the global index
 * 2. Nested library imports work correctly (library A importing library B)
 * 3. Cross-document references resolve via IndexManager.allElements()
 */

import type { AstNodeDescription, LangiumDocument } from 'langium';
import { DefaultScopeComputation } from 'langium';
import { isLibrary, type Library } from './generated/ast.js';

export class EligianScopeComputation extends DefaultScopeComputation {
  /**
   * Override to export Library actions to the global scope.
   *
   * For Library documents:
   * - Export the Library root node itself
   * - Export ALL actions defined in Library.actions
   *
   * For Program documents:
   * - Use default behavior (exports root + direct children)
   *
   * This ensures that when library A imports library B, library B's actions
   * are available in the global scope and can be resolved via IndexManager.
   */
  override async collectExportedSymbols(
    document: LangiumDocument,
    cancelToken = undefined
  ): Promise<AstNodeDescription[]> {
    const root = document.parseResult.value;

    // Feature 032 US3: Special handling for Library documents
    if (isLibrary(root)) {
      return this.exportLibraryActions(root, document);
    }

    // For Program documents, use default behavior
    return super.collectExportedSymbols(document, cancelToken);
  }

  /**
   * Export all actions from a Library document to the global scope.
   *
   * This makes library actions available via IndexManager.allElements(),
   * which is how ScopeProvider.getGlobalScope() finds them for cross-document
   * reference resolution.
   */
  protected async exportLibraryActions(
    library: Library,
    document: LangiumDocument
  ): Promise<AstNodeDescription[]> {
    const descriptions: AstNodeDescription[] = [];

    // Export the Library node itself (allows referencing the library)
    const libraryName = this.nameProvider.getName(library);
    if (libraryName) {
      descriptions.push(this.descriptions.createDescription(library, libraryName, document));
    }

    // Export all action definitions from this library
    for (const action of library.actions || []) {
      const actionName = this.nameProvider.getName(action);
      if (actionName) {
        descriptions.push(this.descriptions.createDescription(action, actionName, document));
      }
    }

    return descriptions;
  }
}
