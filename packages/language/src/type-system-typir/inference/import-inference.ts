/**
 * Import Statement Inference Rules for Typir Integration
 *
 * Registers inference rules for import statements that automatically
 * infer ImportType from DefaultImport and NamedImport AST nodes.
 *
 * @module type-system-typir/inference/import-inference
 */

import type { TypirLangiumServices } from 'typir-langium';
import type { DefaultImport, NamedImport } from '../../generated/ast.js';
import { inferAssetTypeFromExtension } from '../utils/asset-type-inferrer.js';
import type { EligianSpecifics } from '../eligian-specifics.js';
import type { ImportTypeProperties } from '../types/import-type.js';

/**
 * Infer asset type from default import keyword
 *
 * Maps import keywords to their corresponding asset types:
 * - 'layout' → 'html'
 * - 'styles' → 'css'
 * - 'provider' → 'media'
 *
 * @param keyword - Import keyword (layout/styles/provider)
 * @returns Asset type ('html' | 'css' | 'media')
 *
 * @example
 * ```typescript
 * inferAssetTypeFromKeyword('layout')  // => 'html'
 * inferAssetTypeFromKeyword('styles')  // => 'css'
 * inferAssetTypeFromKeyword('provider') // => 'media'
 * ```
 */
export function inferAssetTypeFromKeyword(
  keyword: 'layout' | 'styles' | 'provider'
): 'html' | 'css' | 'media' {
  switch (keyword) {
    case 'layout':
      return 'html';
    case 'styles':
      return 'css';
    case 'provider':
      return 'media';
  }
}

/**
 * Register import inference rules with Typir
 *
 * Registers two inference rules:
 * 1. DefaultImport: Infers asset type from keyword (layout/styles/provider)
 * 2. NamedImport: Infers asset type from file extension or explicit 'as' clause
 *
 * @param typir - Typir services for inference rule registration
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * registerImportInference(this.typirServices);
 * ```
 */
export function registerImportInference(
  typir: TypirLangiumServices<EligianSpecifics>
): void {
  // Register inference rules using the helper method
  typir.Inference.addInferenceRulesForAstNodes({
    /**
     * Infer ImportType from DefaultImport AST node
     *
     * Default imports use keywords (layout/styles/provider) which directly
     * map to asset types. These are always default imports (isDefault: true).
     *
     * @example
     * ```eligian
     * styles './main.css'  // => ImportType { assetType: 'css', path: './main.css', isDefault: true }
     * ```
     */
    DefaultImport: (node: DefaultImport) => {
      const assetType = inferAssetTypeFromKeyword(node.type);
      const properties: ImportTypeProperties = {
        assetType,
        path: node.path,
        isDefault: true,
      };

      // Return the inferred type properties
      // Typir will create the CustomKind type instance using these properties
      return properties;
    },

    /**
     * Infer ImportType from NamedImport AST node
     *
     * Named imports can either:
     * 1. Use explicit type override (as clause): import x from './file' as html
     * 2. Infer from file extension: import x from './theme.css' => 'css'
     *
     * Named imports are never default (isDefault: false).
     *
     * @example
     * ```eligian
     * import myStyles from './theme.css'
     * // => ImportType { assetType: 'css', path: './theme.css', isDefault: false }
     *
     * import data from './data.json' as html
     * // => ImportType { assetType: 'html', path: './data.json', isDefault: false }
     * ```
     */
    NamedImport: (node: NamedImport) => {
      // Prefer explicit type (as clause) over inferred type (file extension)
      const assetType = node.assetType
        ? node.assetType // Explicit type from 'as' clause
        : inferAssetTypeFromExtension(node.path); // Infer from extension

      const properties: ImportTypeProperties = {
        assetType,
        path: node.path,
        isDefault: false,
      };

      return properties;
    },
  });
}
