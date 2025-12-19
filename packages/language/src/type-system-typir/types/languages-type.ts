/**
 * LanguagesType Factory for Typir Integration
 *
 * Creates a CustomKind type factory for languages blocks that provides:
 * - Type name calculation for hover display ("Languages: 3 languages, default: en-US")
 * - Type properties (languageCount, defaultLanguage, allLanguages)
 * - Integration with Typir's type system
 *
 * Feature 037: User Story 5 - Typir Type Integration
 * Tasks: T051-T054
 *
 * @module type-system-typir/types/languages-type
 */

import { CustomKind } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * Properties for LanguagesType CustomKind
 *
 * Note: The index signature is required by Typir's CustomTypeProperties constraint.
 *
 * T051: LanguagesTypeProperties interface
 */
interface LanguagesTypeProperties {
  /**
   * Total number of languages declared in the languages block
   * Used for hover display and validation
   */
  languageCount: number;

  /**
   * Default language code (marked with * or first language if single)
   * - Single language: First (and only) language
   * - Multiple languages: Language marked with *
   */
  defaultLanguage: string;

  /**
   * Array of all language codes declared in the block
   * Order: default language first, then others in declaration order
   */
  allLanguages: string[];

  /**
   * Index signature required by Typir CustomTypeProperties
   * Must be: string | number | boolean | bigint | symbol | Type | arrays/maps/sets of these
   */
  [key: string]: string | number | string[];
}

/**
 * T052: Calculate type name for hover display
 *
 * Generates user-friendly type names with singular/plural handling:
 * - 1 language: "Languages: 1 language, default: en-US"
 * - 2+ languages: "Languages: 3 languages, default: nl-NL"
 *
 * @param props - LanguagesType properties
 * @returns Type name string with correct singular/plural form
 *
 * @example
 * ```typescript
 * calculateLanguagesTypeName({ languageCount: 1, defaultLanguage: 'en-US', allLanguages: ['en-US'] })
 * // Returns: "Languages: 1 language, default: en-US"
 *
 * calculateLanguagesTypeName({ languageCount: 3, defaultLanguage: 'nl-NL', allLanguages: ['nl-NL', 'en-US', 'fr-FR'] })
 * // Returns: "Languages: 3 languages, default: nl-NL"
 * ```
 */
function calculateLanguagesTypeName(props: LanguagesTypeProperties): string {
  const languageWord = props.languageCount === 1 ? 'language' : 'languages';
  return `Languages: ${props.languageCount} ${languageWord}, default: ${props.defaultLanguage}`;
}

/**
 * T053: Calculate unique type identifier for caching
 *
 * Generates cache keys in format: "Languages:{count}:{defaultLanguage}"
 * This ensures types with same configuration reuse cached instances.
 *
 * @param props - LanguagesType properties
 * @returns Unique identifier string
 *
 * @example
 * ```typescript
 * calculateLanguagesTypeIdentifier({ languageCount: 3, defaultLanguage: 'nl-NL', allLanguages: ['nl-NL', 'en-US', 'fr-FR'] })
 * // Returns: "Languages:3:nl-NL"
 * ```
 */
function calculateLanguagesTypeIdentifier(props: LanguagesTypeProperties): string {
  return `Languages:${props.languageCount}:${props.defaultLanguage}`;
}

/**
 * T054: Create LanguagesType CustomKind factory
 *
 * This factory creates Typir types for languages blocks that can be used
 * for type inference, validation, and hover information in VS Code.
 *
 * @param typir - Typir services for type creation
 * @returns CustomKind factory for LanguagesType
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * const languagesFactory = createLanguagesTypeFactory(typir);
 * registerLanguagesInference(typir, languagesFactory);
 * // Factory is now registered and can infer types from AST nodes
 * ```
 */
export function createLanguagesTypeFactory(
  typir: TypirLangiumServices<EligianSpecifics>
): CustomKind<LanguagesTypeProperties, EligianSpecifics> {
  return new CustomKind<LanguagesTypeProperties, EligianSpecifics>(typir, {
    name: 'Languages',
    calculateTypeName: props => calculateLanguagesTypeName(props as LanguagesTypeProperties),
    calculateTypeIdentifier: props =>
      calculateLanguagesTypeIdentifier(props as LanguagesTypeProperties),
  });
}
