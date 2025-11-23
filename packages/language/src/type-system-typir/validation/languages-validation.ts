/**
 * Languages Block Validation Rules for Typir Integration
 *
 * Registers validation rules for languages blocks that detect:
 * - Duplicate language codes across all entries
 * - Missing default marker when multiple languages declared
 * - Multiple default markers (only one allowed)
 *
 * Note: These validations complement the Langium validators in eligian-validator.ts
 * This provides Typir-level validation for type system integration.
 *
 * Feature 037: User Story 5 - Typir Type Integration
 * Task: T056
 *
 * @module type-system-typir/validation/languages-validation
 */

import type { ValidationProblemAcceptor } from 'typir';
import type { TypirLangiumServices } from 'typir-langium';
import type { LanguagesBlock } from '../../generated/ast.js';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * T056: Register languages validation rules with Typir
 *
 * Registers validation rules for LanguagesBlock:
 * 1. Check for duplicate language codes
 * 2. Validate default marker rules (single language: optional, multiple: required and unique)
 *
 * Note: Primary validation is handled by Langium validators (eligian-validator.ts).
 * This provides additional Typir-level validation for type system integration.
 *
 * @param typir - Typir services for validation rule registration
 *
 * @example
 * ```typescript
 * // In EligianTypeSystem.onInitialize():
 * registerLanguagesValidation(this.typirServices);
 * ```
 */
export function registerLanguagesValidation(typir: TypirLangiumServices<EligianSpecifics>): void {
  typir.validation.Collector.addValidationRulesForAstNodes({
    /**
     * Validate LanguagesBlock for:
     * - Duplicate language codes
     * - Default marker rules (multiple languages need exactly one default)
     *
     * @example
     * ```eligian
     * // ❌ Error: Duplicate language code
     * languages {
     *   * "en-US" "English (US)"
     *     "en-US" "American English"
     * }
     *
     * // ❌ Error: Missing default marker
     * languages {
     *   "en-US" "English"
     *   "nl-NL" "Nederlands"
     * }
     *
     * // ❌ Error: Multiple default markers
     * languages {
     *   * "en-US" "English"
     *   * "nl-NL" "Nederlands"
     * }
     * ```
     */
    LanguagesBlock: (node: LanguagesBlock, accept: ValidationProblemAcceptor<EligianSpecifics>) => {
      // Validation 1: Check for duplicate language codes
      const seenCodes = new Set<string>();
      for (const entry of node.entries) {
        if (seenCodes.has(entry.code)) {
          accept({
            severity: 'error',
            message: `Duplicate language code: '${entry.code}'`,
            languageNode: entry,
            languageProperty: 'code',
          });
        } else {
          seenCodes.add(entry.code);
        }
      }

      // Validation 2: Check default marker rules (only for multiple languages)
      if (node.entries.length > 1) {
        const defaultEntries = node.entries.filter(entry => entry.isDefault === true);

        // Missing default marker
        if (defaultEntries.length === 0) {
          accept({
            severity: 'error',
            message:
              "Multiple languages declared but no default language marked with '*'. Mark exactly one language as default.",
            languageNode: node,
          });
        }

        // Multiple default markers
        if (defaultEntries.length > 1) {
          // Report error on second and subsequent default markers
          for (let i = 1; i < defaultEntries.length; i++) {
            accept({
              severity: 'error',
              message: "Only one language can be marked as default with '*'",
              languageNode: defaultEntries[i],
              languageProperty: 'isDefault',
            });
          }
        }
      }
    },
  });
}
