/**
 * ImportType Factory for Typir Integration
 *
 * Creates a CustomKind type factory for import statements that provides:
 * - Type name calculation for hover display ("Import<css>")
 * - Type properties (assetType, path, isDefault)
 * - Integration with Typir's type system
 *
 * @module type-system-typir/types/import-type
 */

import { CustomKind } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * Properties for ImportType CustomKind
 *
 * Note: The index signature is required by Typir's CustomTypeProperties constraint.
 */
export interface ImportTypeProperties {
  /**
   * Asset type inferred from import keyword or file extension
   * - 'html': HTML layouts, content snippets
   * - 'css': CSS stylesheets, class definitions
   * - 'media': Video/audio files (timeline providers)
   */
  assetType: 'html' | 'css' | 'media';

  /**
   * Relative file path to the asset
   * Must start with './' or '../'
   */
  path: string;

  /**
   * Whether this is a default import (layout/styles/provider)
   * - true: Default import (only one per type per document)
   * - false: Named import (multiple allowed)
   */
  isDefault: boolean;

  /**
   * Index signature required by Typir CustomTypeProperties
   * Must be: string | number | boolean | bigint | symbol | Type | arrays/maps/sets of these
   */
  [key: string]: string | boolean;
}

/**
 * Calculate type name for hover display
 *
 * @param props - ImportType properties
 * @returns Type name string: "Import<assetType>"
 *
 * @example
 * ```typescript
 * calculateImportTypeName({ assetType: 'css', path: './main.css', isDefault: true })
 * // Returns: "Import<css>"
 * ```
 */
function calculateImportTypeName(props: ImportTypeProperties): string {
  return `Import<${props.assetType}>`;
}

/**
 * Calculate unique type identifier for caching
 *
 * @param props - ImportType properties
 * @returns Unique identifier string
 *
 * @example
 * ```typescript
 * calculateImportTypeIdentifier({ assetType: 'css', path: './main.css', isDefault: true })
 * // Returns: "Import<css>:./main.css:true"
 * ```
 */
function calculateImportTypeIdentifier(props: ImportTypeProperties): string {
  return `Import<${props.assetType}>:${props.path}:${props.isDefault}`;
}

/**
 * Create ImportType CustomKind factory
 *
 * This factory creates Typir types for import statements that can be used
 * for type inference, validation, and hover information.
 *
 * @param typir - Typir services for type creation
 * @returns CustomKind factory for ImportType
 *
 * @example
 * ```typescript
 * const importFactory = createImportTypeFactory(typir);
 * // Factory is now registered and can infer types from AST nodes
 * ```
 */
export function createImportTypeFactory(
  typir: TypirLangiumServices<EligianSpecifics>
): CustomKind<ImportTypeProperties, EligianSpecifics> {
  return new CustomKind<ImportTypeProperties, EligianSpecifics>(typir, {
    name: 'Import',
    calculateTypeName: calculateImportTypeName,
    calculateTypeIdentifier: calculateImportTypeIdentifier,
  });
}
