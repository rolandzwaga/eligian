/**
 * Languages Block Inference Rules for Typir Integration
 *
 * Registers inference rules for languages blocks that automatically
 * infer LanguagesType from LanguagesBlock AST nodes.
 *
 * Feature 037: User Story 5 - Typir Type Integration
 * Task: T055
 *
 * @module type-system-typir/inference/languages-inference
 */

import type { TypirLangiumServices } from 'typir-langium';
import type { LanguagesBlock } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * T055: Register languages inference rules with Typir
 *
 * Registers inference rule for LanguagesBlock AST nodes:
 * - Extracts language count, default language, and all languages
 * - Determines default: language with isDefault===true, or first language
 * - Creates LanguagesType for hover display and validation
 *
 * @param typir - Typir services for inference rule registration
 * @param languagesFactory - CustomKind factory for creating LanguagesType instances
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * const languagesFactory = createLanguagesTypeFactory(typir);
 * registerLanguagesInference(typir, languagesFactory);
 * ```
 */
export function registerLanguagesInference(
  typir: TypirLangiumServices<EligianSpecifics>,
  languagesFactory: any // CustomKind<LanguagesTypeProperties, EligianSpecifics>
): void {
  // Register inference rules using the helper method
  typir.Inference.addInferenceRulesForAstNodes({
    /**
     * Infer LanguagesType from LanguagesBlock AST node
     *
     * Extracts language metadata for type inference:
     * 1. Count total number of language entries
     * 2. Find default language (marked with * or first entry)
     * 3. Collect all language codes in declaration order
     *
     * @example
     * ```eligian
     * languages {
     *   * "nl-NL" "Nederlands"
     *     "en-US" "English"
     *     "fr-FR" "Français"
     * }
     * // => LanguagesType {
     * //      languageCount: 3,
     * //      defaultLanguage: 'nl-NL',
     * //      allLanguages: ['nl-NL', 'en-US', 'fr-FR']
     * //    }
     * ```
     */
    LanguagesBlock: (node: LanguagesBlock) => {
      // Extract language count
      const languageCount = node.entries.length;

      // Find default language (marked with isDefault===true or first entry)
      const defaultEntry = node.entries.find(entry => entry.isDefault === true) || node.entries[0];
      const defaultLanguage = defaultEntry?.code || 'en-US'; // Fallback to en-US if empty

      // Collect all language codes in declaration order
      const allLanguages = node.entries.map(entry => entry.code);

      // Create LanguagesType using the factory
      return languagesFactory.create({
        languageCount,
        defaultLanguage,
        allLanguages,
      });
    },
  });
}
