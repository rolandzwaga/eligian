/**
 * LabelIDType Factory for Typir Integration
 *
 * Creates a CustomKind type factory for label IDs that provides:
 * - Type name calculation for hover display ("LabelID<id>")
 * - Type properties (labelGroupId, translationCount, languageCodes)
 * - Integration with Typir's type system
 *
 * @module type-system-typir/types/label-id-type
 */

import { CustomKind } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * Properties for LabelIDType CustomKind
 *
 * Note: The index signature is required by Typir's CustomTypeProperties constraint.
 */
export interface LabelIDTypeProperties {
  /**
   * Label group ID from imported labels JSON
   * Example: "welcome-title", "button-text"
   */
  labelGroupId: string;

  /**
   * Number of translations available for this label group
   * Example: 2 (for en-US and nl-NL)
   */
  translationCount: number;

  /**
   * Language codes for all available translations
   * Example: ["en-US", "nl-NL"]
   */
  languageCodes: string[];

  /**
   * Index signature required by Typir CustomTypeProperties
   * Must be: string | number | boolean | bigint | symbol | Type | arrays/maps/sets of these
   */
  [key: string]: string | number | string[];
}

/**
 * Calculate type name for hover display
 *
 * @param props - LabelIDType properties storage
 * @returns Type name string: "LabelID<labelGroupId>"
 *
 * @example
 * ```typescript
 * calculateLabelIDTypeName({ labelGroupId: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] })
 * // Returns: "LabelID<welcome-title>"
 * ```
 */
function calculateLabelIDTypeName(props: { labelGroupId: string }): string {
  return `LabelID<${props.labelGroupId}>`;
}

/**
 * Calculate unique type identifier for caching
 *
 * @param props - LabelIDType properties storage
 * @returns Unique identifier string
 *
 * @example
 * ```typescript
 * calculateLabelIDTypeIdentifier({ labelGroupId: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL'] })
 * // Returns: "LabelID<welcome-title>:2"
 * ```
 */
function calculateLabelIDTypeIdentifier(props: {
  labelGroupId: string;
  translationCount: number;
}): string {
  return `LabelID<${props.labelGroupId}>:${props.translationCount}`;
}

/**
 * Create LabelIDType CustomKind factory
 *
 * This factory creates Typir types for label ID references that can be used
 * for type inference, validation, and hover information.
 *
 * @param typir - Typir services for type creation
 * @returns CustomKind factory for LabelIDType
 *
 * @example
 * ```typescript
 * const labelIDFactory = createLabelIDTypeFactory(typir);
 * // Factory is now registered and can infer types from AST nodes
 * ```
 */
export function createLabelIDTypeFactory(
  typir: TypirLangiumServices<EligianSpecifics>
): CustomKind<LabelIDTypeProperties, EligianSpecifics> {
  return new CustomKind<LabelIDTypeProperties, EligianSpecifics>(typir, {
    name: 'LabelID',
    calculateTypeName: calculateLabelIDTypeName,
    calculateTypeIdentifier: calculateLabelIDTypeIdentifier,
  });
}
