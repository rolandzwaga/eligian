import { type AstNode, AstUtils, type Properties, type ValidationAcceptor } from 'langium';
import type { EligianServices } from '../eligian-module.js';
import type { Library, Program } from '../generated/ast.js';
import { isLibrary, isProgram } from '../generated/ast.js';
import { isDefaultImport } from '../utils/ast-helpers.js';
import { resolveImportPathToUri } from '../utils/path-utils.js';
import { getImports } from '../utils/program-helpers.js';

/**
 * Shared base for the focused Eligian validator classes.
 *
 * Holds the constructor-injected services plus the helpers used by more than one
 * validator group (root traversal, library resolution, duplicate-by-name reporting,
 * and CSS import registration). Subclasses register their own checks via
 * `ValidationRegistry.register(map, instance)`.
 */
export abstract class BaseValidator {
  protected services: EligianServices;

  constructor(services: EligianServices) {
    this.services = services;
  }

  /**
   * Helper: Get the Program node from any AST node
   */
  protected getProgram(node: AstNode): Program | undefined {
    return AstUtils.getContainerOfType(node, isProgram);
  }

  /**
   * Get the containing Library node for a given AST node (Feature 023).
   * Walks up the AST tree until a Library node is found.
   */
  protected getLibrary(node: AstNode): Library | undefined {
    return AstUtils.getContainerOfType(node, isLibrary);
  }

  /**
   * Report a `duplicate_*` error on the second and later occurrence of any
   * named node sharing a name within `items`.
   *
   * Single source of truth (D27) for the "track names in a Map, error on the
   * duplicate" loop that was hand-coded for actions, library actions, and
   * constants. The first occurrence is recorded; every subsequent one is flagged
   * on its `name` property with the given diagnostic `code`.
   *
   * @param items - Named nodes to scan, in source order
   * @param messageFor - Builds the diagnostic message for a duplicate node
   * @param code - Diagnostic code for the emitted error
   * @param accept - Langium validation acceptor
   */
  protected reportDuplicatesByName<T extends AstNode & { name: string }>(
    items: Iterable<T>,
    messageFor: (item: T) => string,
    code: string,
    accept: ValidationAcceptor
  ): void {
    const seen = new Map<string, T>();

    for (const item of items) {
      if (seen.has(item.name)) {
        // Found duplicate - report error on the second/later definition
        accept('error', messageFor(item), {
          node: item,
          property: 'name' as Properties<T>,
          code,
        });
      } else {
        seen.set(item.name, item);
      }
    }
  }

  /**
   * Helper method to register CSS imports for a document.
   *
   * This extracts CSS import statements from the Program node and registers
   * them with the CSSRegistryService. It's called from:
   * - checkCSSImports (Program validator, runs after child validators)
   * - checkClassNameParameter (OperationCall validator, lazy initialization)
   *
   * @param program - The Program AST node
   * @param documentUri - The document URI
   */
  protected ensureCSSImportsRegistered(program: Program, documentUri: string): void {
    if (!this.services) return;

    const cssRegistry = this.services.css.CSSRegistry;

    // Extract all CSS imports (DefaultImport with type='styles')
    const allImports = getImports(program);
    const cssImports = allImports.filter(imp => isDefaultImport(imp) && imp.type === 'styles');

    // Convert CSS file paths to absolute URIs (must match language server format)
    const cssFileUris: string[] = [];

    for (const cssImport of cssImports) {
      if (!cssImport.path) {
        continue;
      }
      // Resolve relative path to absolute URI (D4: shared resolution)
      cssFileUris.push(resolveImportPathToUri(documentUri, cssImport.path));
    }

    // Register CSS imports with the registry (idempotent - safe to call multiple times)
    cssRegistry.registerImports(documentUri, cssFileUris);
  }
}
