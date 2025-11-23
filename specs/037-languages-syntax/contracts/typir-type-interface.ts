/**
 * Typir Type Interface: Languages Declaration Syntax
 * Feature: 037-languages-syntax
 *
 * Defines the Typir type representation for LanguagesBlock,
 * providing IDE hover support and compile-time type validation.
 */

import type { CustomKind, TypirServices } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { EligianSpecifics } from '../typir';

/**
 * Type properties for LanguagesType
 *
 * Used by Typir's CustomKind factory to create type representations
 * of languages blocks for hover tooltips and validation.
 */
export interface LanguagesTypeProperties {
  /**
   * Total number of languages in the block
   * Example: 3 for block with en-US, nl-NL, fr-FR
   */
  languageCount: number;

  /**
   * Default language code (marked with * or first if single language)
   * Format: IETF BCP 47 (xx-XX)
   * Example: "en-US"
   */
  defaultLanguage: string;

  /**
   * Array of all language codes in the block
   * Format: Array of IETF BCP 47 codes
   * Example: ["en-US", "nl-NL", "fr-FR"]
   */
  allLanguages: string[];

  /**
   * Index signature required by Typir CustomTypeProperties
   * Allows Typir to store and retrieve type metadata
   */
  [key: string]: string | number | string[];
}

/**
 * Typir type factory for languages blocks
 *
 * Creates LanguagesType instances that provide IDE hover support
 * and type validation for languages block declarations.
 *
 * @param typir - Typir services instance
 * @returns CustomKind factory for LanguagesType
 *
 * @example Type creation
 * ```typescript
 * const factory = createLanguagesTypeFactory(typir);
 * const languagesType = factory.create({
 *   languageCount: 3,
 *   defaultLanguage: "en-US",
 *   allLanguages: ["en-US", "nl-NL", "fr-FR"]
 * });
 * ```
 *
 * @example Hover output (multiple languages)
 * ```
 * Languages: 3 languages, default: en-US
 * ```
 *
 * @example Hover output (single language)
 * ```
 * Languages: 1 language, default: en-US
 * ```
 *
 * @example Type identifier (for caching)
 * ```
 * "Languages:3:en-US"
 * ```
 */
export function createLanguagesTypeFactory(
  typir: TypirLangiumServices<EligianSpecifics>
): CustomKind<LanguagesTypeProperties, EligianSpecifics>;

/**
 * Type name calculation
 *
 * Generates human-readable type name for hover tooltips.
 * Uses singular "language" for count=1, plural "languages" otherwise.
 *
 * @param props - LanguagesTypeProperties
 * @returns Formatted type name
 *
 * @example
 * calculateLanguagesTypeName({ languageCount: 1, defaultLanguage: "en-US", ... })
 * // Returns: "Languages: 1 language, default: en-US"
 *
 * calculateLanguagesTypeName({ languageCount: 3, defaultLanguage: "nl-NL", ... })
 * // Returns: "Languages: 3 languages, default: nl-NL"
 */
export function calculateLanguagesTypeName(
  props: LanguagesTypeProperties
): string;

/**
 * Type identifier calculation
 *
 * Generates unique identifier for type caching and comparison.
 * Format: "Languages:{count}:{defaultLanguage}"
 *
 * @param props - LanguagesTypeProperties
 * @returns Unique type identifier
 *
 * @example
 * calculateLanguagesTypeIdentifier({ languageCount: 3, defaultLanguage: "en-US", ... })
 * // Returns: "Languages:3:en-US"
 */
export function calculateLanguagesTypeIdentifier(
  props: LanguagesTypeProperties
): string;

/**
 * Type inference registration
 *
 * Registers inference rules for LanguagesBlock AST nodes.
 * Called during Typir initialization.
 *
 * @param typir - Typir services instance
 * @param languagesFactory - LanguagesType factory
 *
 * @example Inference from AST
 * ```typescript
 * // Given LanguagesBlock AST:
 * {
 *   entries: [
 *     { isDefault: true, code: "en-US", label: "English" },
 *     { isDefault: false, code: "nl-NL", label: "Nederlands" }
 *   ]
 * }
 *
 * // Inferred type:
 * LanguagesType {
 *   languageCount: 2,
 *   defaultLanguage: "en-US",
 *   allLanguages: ["en-US", "nl-NL"]
 * }
 * ```
 */
export function registerLanguagesInference(
  typir: TypirLangiumServices<EligianSpecifics>,
  languagesFactory: CustomKind<LanguagesTypeProperties, EligianSpecifics>
): void;

/**
 * Type validation registration
 *
 * Registers Typir validation rules for LanguagesBlock.
 * Complements Langium validators with type-level checks.
 *
 * @param typir - Typir services instance
 *
 * Validation rules:
 * - Duplicate language codes (reported via Typir diagnostics)
 * - Default marker consistency (single vs. multiple languages)
 * - Language code format validation (IETF BCP 47)
 *
 * Note: These overlap with Langium validators (eligian-validator.ts).
 * Typir validation runs during type inference and provides
 * additional diagnostics in the IDE.
 */
export function registerLanguagesValidation(
  typir: TypirLangiumServices<EligianSpecifics>
): void;

/**
 * Integration with Typir Type System
 *
 * File locations (following Feature 021 patterns):
 * - packages/language/src/type-system-typir/types/languages-type.ts
 * - packages/language/src/type-system-typir/inference/languages-inference.ts
 * - packages/language/src/type-system-typir/validation/languages-validation.ts
 *
 * Registration (in eligian-type-system.ts):
 * ```typescript
 * // Create factory
 * const languagesFactory = createLanguagesTypeFactory(typir);
 *
 * // Register inference rules
 * registerLanguagesInference(typir, languagesFactory);
 *
 * // Register validation rules
 * registerLanguagesValidation(typir);
 * ```
 *
 * Hover Provider Integration:
 * - Hover provider automatically uses Typir-inferred types
 * - No additional code needed (handled by typir-langium)
 * - Hover tooltip shows calculateLanguagesTypeName() output
 *
 * Performance:
 * - Type inference: <50ms (per Feature 021 benchmarks)
 * - Hover response: <300ms (per Feature 037 success criteria SC-004)
 */
