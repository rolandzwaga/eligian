/**
 * AST Transformer Interface: Languages Declaration Syntax
 * Feature: 037-languages-syntax
 *
 * Defines the contract for transforming LanguagesBlock AST nodes
 * to Eligius configuration properties.
 */

import type { ILabel } from 'eligius';
import type { LanguagesBlock } from '../ast';

/**
 * Transformer for languages block declarations
 */
export interface LanguagesTransformer {
  /**
   * Transforms LanguagesBlock AST node to Eligius configuration properties
   *
   * @param block - LanguagesBlock AST node (or undefined if not present in program)
   * @returns Object with language and availableLanguages properties
   *
   * @example Single language
   * ```typescript
   * const block: LanguagesBlock = {
   *   entries: [
   *     { isDefault: false, code: "en-US", label: "English" }
   *   ]
   * };
   * transformLanguagesBlock(block);
   * // Returns:
   * // {
   * //   language: "en-US",
   * //   availableLanguages: [
   * //     { id: "550e8400-...", languageCode: "en-US", label: "English" }
   * //   ]
   * // }
   * ```
   *
   * @example Multiple languages with explicit default
   * ```typescript
   * const block: LanguagesBlock = {
   *   entries: [
   *     { isDefault: true, code: "nl-NL", label: "Nederlands" },
   *     { isDefault: false, code: "en-US", label: "English" }
   *   ]
   * };
   * transformLanguagesBlock(block);
   * // Returns:
   * // {
   * //   language: "nl-NL",
   * //   availableLanguages: [
   * //     { id: "...", languageCode: "nl-NL", label: "Nederlands" },
   * //     { id: "...", languageCode: "en-US", label: "English" }
   * //   ]
   * // }
   * ```
   *
   * @example No languages block (backward compatible)
   * ```typescript
   * transformLanguagesBlock(undefined);
   * // Returns:
   * // {
   * //   language: "en-US",
   * //   availableLanguages: [
   * //     { id: "...", languageCode: "en-US", label: "English" }
   * //   ]
   * // }
   * ```
   */
  transformLanguagesBlock(
    block: LanguagesBlock | undefined
  ): {
    language: string;
    availableLanguages: ILabel[];
  };
}

/**
 * ILabel format (from Eligius library)
 *
 * Represents a language option in the Eligius configuration.
 */
export interface ILabel {
  /**
   * Unique identifier for this label
   * Format: UUID v4 (generated via crypto.randomUUID())
   * Example: "550e8400-e29b-41d4-a716-446655440000"
   */
  id: string;

  /**
   * IETF BCP 47 language code
   * Format: xx-XX (lowercase primary, uppercase region)
   * Examples: "en-US", "nl-NL", "fr-FR", "de-DE"
   */
  languageCode: string;

  /**
   * Human-readable display label for this language
   * Examples: "English", "Nederlands", "Français", "Deutsch"
   */
  label: string;
}

/**
 * Default behavior when block is undefined:
 * {
 *   language: "en-US",
 *   availableLanguages: [
 *     { id: crypto.randomUUID(), languageCode: "en-US", label: "English" }
 *   ]
 * }
 */

/**
 * Implementation notes:
 *
 * 1. Default Language Selection:
 *    - Multiple entries: Find entry where isDefault === true
 *    - Single entry: Use the only entry (implicit default)
 *
 * 2. ILabel Generation:
 *    - id: Generate via crypto.randomUUID() (Constitution Principle VII)
 *    - languageCode: From LanguageEntry.code
 *    - label: From LanguageEntry.label
 *
 * 3. Backward Compatibility:
 *    - When block is undefined, use hardcoded en-US defaults
 *    - Matches existing behavior in createDefaultConfiguration()
 *
 * 4. Validation:
 *    - Assumes validation has already passed (run by eligian-validator.ts)
 *    - Default marker validation ensures exactly one default for multiple languages
 *    - Language code format validation ensures IETF BCP 47 compliance
 */
