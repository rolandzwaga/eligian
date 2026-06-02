import type { ValidationAcceptor } from 'langium';
import { isValidLanguageCode } from '../eligian-validator.js';
import type { LanguagesBlock } from '../generated/ast.js';
import { BaseValidator } from './base-validator.js';

/**
 * Validations for the languages declaration block (Feature 037).
 */
export class LanguagesValidator extends BaseValidator {
  /**
   * T023-T024: Feature 037 US2 - Validate default marker rules for languages block
   *
   * Rules:
   * - Single language (1 entry): No * marker required (implicit default)
   * - Multiple languages (2+ entries): Exactly one * marker required (explicit default)
   * - Multiple languages with no * marker: Error
   * - Multiple languages with multiple * markers: Error
   */
  checkDefaultMarker(block: LanguagesBlock, accept: ValidationAcceptor): void {
    const entryCount = block.entries.length;

    if (entryCount === 1) {
      // Single language - * marker is optional (implicit default)
      // No validation needed
      return;
    }

    // Multiple languages - need exactly one * marker
    const defaultMarkerCount = block.entries.filter(entry => entry.isDefault).length;

    if (defaultMarkerCount === 0) {
      // T023: Missing * marker error
      accept(
        'error',
        'Multiple languages require exactly one * marker to indicate the default language',
        {
          node: block,
          code: 'missing_default_marker',
        }
      );
    } else if (defaultMarkerCount > 1) {
      // T024: Multiple * markers error
      accept('error', 'Only one language can be marked as default with the * marker', {
        node: block,
        code: 'multiple_default_markers',
      });
    }
  }

  /**
   * T040: Feature 037 US4 - Validate language code format (IETF BCP 47: xx-XX)
   *
   * Checks each language code in the block for correct format:
   * - Primary language: 2-3 lowercase letters
   * - Hyphen: -
   * - Region: 2-3 uppercase letters
   */
  checkLanguageCodeFormat(block: LanguagesBlock, accept: ValidationAcceptor): void {
    for (const entry of block.entries) {
      if (!isValidLanguageCode(entry.code)) {
        accept(
          'error',
          "Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')",
          {
            node: entry,
            property: 'code',
            code: 'invalid_language_code_format',
          }
        );
      }
    }
  }

  /**
   * T041: Feature 037 US4 - Validate no duplicate language codes
   *
   * Ensures each language code appears only once in the languages block.
   */
  checkDuplicateLanguageCodes(block: LanguagesBlock, accept: ValidationAcceptor): void {
    const seen = new Set<string>();

    for (const entry of block.entries) {
      if (seen.has(entry.code)) {
        accept('error', `Duplicate language code: '${entry.code}'`, {
          node: entry,
          property: 'code',
          code: 'duplicate_language_code',
        });
      } else {
        seen.add(entry.code);
      }
    }
  }

  /**
   * T043: Feature 037 US4 - Validate languages block is not empty
   */
  checkNonEmptyLanguagesBlock(block: LanguagesBlock, accept: ValidationAcceptor): void {
    if (block.entries.length === 0) {
      accept('error', 'Languages block cannot be empty. Declare at least one language.', {
        node: block,
        code: 'empty_languages_block',
      });
    }
  }
}
