/**
 * Import Statement Validation Rules for Typir Integration
 *
 * Registers validation rules for import statements that detect:
 * - Duplicate default imports (only one layout/styles/provider per document)
 * - Asset type mismatches (file extension conflicts with explicit 'as' type)
 *
 * @module type-system-typir/validation/import-validation
 */

import type { ValidationProblemAcceptor } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { DefaultImport, NamedImport, Program } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';
import { inferAssetTypeFromExtension } from '../utils/asset-type-inferrer.js';

/**
 * Register import validation rules with Typir
 *
 * Registers validation rules for:
 * 1. Program: Check for duplicate default imports across entire document
 * 2. NamedImport: Warn when explicit 'as' type conflicts with file extension
 *
 * @param typir - Typir services for validation rule registration
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * registerImportValidation(this.typirServices);
 * ```
 */
export function registerImportValidation(typir: TypirLangiumServices<EligianSpecifics>): void {
  // Track which documents have already been validated to prevent duplicate validation
  const validatedDocuments = new WeakSet<Program>();

  typir.validation.Collector.addValidationRulesForAstNodes({
    /**
     * Validate Program for duplicate default imports
     *
     * Checks that there is at most one of each default import type:
     * - Only one 'layout' import per document
     * - Only one 'styles' import per document
     * - Only one 'provider' import per document
     *
     * @example
     * ```eligian
     * // ❌ Error: Duplicate 'layout' import
     * layout './layout1.html'
     * layout './layout2.html'
     * ```
     */
    Program: (node: Program, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      // Guard: Skip if this document has already been validated
      if (validatedDocuments.has(node)) {
        return;
      }
      validatedDocuments.add(node);

      // Track seen default imports by type
      const seenDefaultImports = new Map<string, DefaultImport>();

      // Traverse all statements in the program
      for (const statement of node.statements) {
        // Check if statement is a DefaultImport
        if (statement.$type === 'DefaultImport') {
          const defaultImport = statement as DefaultImport;
          const importType = defaultImport.type;

          // Check if we've already seen this import type
          if (seenDefaultImports.has(importType)) {
            // Report error on the duplicate import
            accept({
              severity: 'error',
              message: `Duplicate '${importType}' import. Only one ${importType} import is allowed per document.`,
              languageNode: defaultImport,
              languageProperty: 'type',
            });
          } else {
            // Track this import type
            seenDefaultImports.set(importType, defaultImport);
          }
        }
      }
    },

    /**
     * Validate NamedImport for asset type mismatches
     *
     * When a named import has an explicit 'as' clause, validate that it
     * matches the type inferred from the file extension. Warn if there's
     * a mismatch.
     *
     * @example
     * ```eligian
     * // ⚠️ Warning: Asset type mismatch
     * import video from './intro.mp4' as html
     * // File extension suggests 'media', but explicit type is 'html'
     * ```
     */
    NamedImport: (node: NamedImport, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      // Only validate if explicit type is provided (as clause)
      if (!node.assetType) {
        // No explicit type, nothing to validate
        return;
      }

      // Infer type from file extension
      const inferredType = inferAssetTypeFromExtension(node.path);

      // Check if explicit type matches inferred type
      if (node.assetType !== inferredType) {
        // Report warning about type mismatch
        accept({
          severity: 'warning',
          message: `Asset type '${node.assetType}' conflicts with inferred type '${inferredType}' from file extension (path: '${node.path}')`,
          languageNode: node,
          languageProperty: 'assetType',
        });
      }
    },
  });
}
