/**
 * Validator Interface: Languages Declaration Syntax
 * Feature: 037-languages-syntax
 *
 * Defines validation rules for LanguagesBlock and LanguageEntry AST nodes.
 */

import type { ValidationAcceptor } from 'langium';
import type { LanguagesBlock, LanguageEntry, Program } from '../ast';

/**
 * Validator for languages block declarations
 */
export interface LanguagesValidator {
  /**
   * Validates languages block position (must be first declaration)
   *
   * Rule: FR-004
   * Grammar enforces this at parse time, so this validator may be redundant.
   * Include as defensive check if grammar enforcement is insufficient.
   *
   * @param program - Program AST node
   * @param accept - ValidationAcceptor for reporting errors
   *
   * @example Valid: languages block first
   * ```eligian
   * languages { "en-US" "English" }
   * layout "./index.html"
   * ```
   *
   * @example Invalid: languages block after other declarations
   * ```eligian
   * layout "./index.html"
   * languages { "en-US" "English" }  // ❌ Must be first
   * ```
   */
  checkLanguagesBlockPosition(
    program: Program,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates language code format (IETF xx-XX pattern)
   *
   * Rule: FR-005
   * Pattern: /^[a-z]{2,3}-[A-Z]{2,3}$/
   * Format: lowercase primary language (2-3 chars), hyphen, uppercase region (2-3 chars)
   *
   * @param entry - LanguageEntry AST node
   * @param accept - ValidationAcceptor for reporting errors
   *
   * @example Valid codes
   * - "en-US" ✅
   * - "nl-NL" ✅
   * - "fr-FR" ✅
   * - "pt-BR" ✅
   *
   * @example Invalid codes
   * - "EN-US" ❌ (uppercase primary)
   * - "en-us" ❌ (lowercase region)
   * - "english" ❌ (no region)
   * - "en_US" ❌ (underscore instead of hyphen)
   *
   * Error message:
   * "Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')"
   */
  checkLanguageCodeFormat(
    entry: LanguageEntry,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates default marker rules
   *
   * Rules: FR-002, FR-003
   * - Single language (1 entry): * marker optional (implicit default)
   * - Multiple languages (2+ entries): Exactly one * marker required
   *
   * @param block - LanguagesBlock AST node
   * @param accept - ValidationAcceptor for reporting errors
   *
   * @example Valid: Single language, no marker
   * ```eligian
   * languages {
   *   "en-US" "English"  // Implicit default
   * }
   * ```
   *
   * @example Valid: Multiple languages, one marker
   * ```eligian
   * languages {
   *   * "nl-NL" "Nederlands"  // Explicit default
   *     "en-US" "English"
   * }
   * ```
   *
   * @example Invalid: Multiple languages, no marker
   * ```eligian
   * languages {
   *   "en-US" "English"
   *   "nl-NL" "Nederlands"  // ❌ Missing default marker
   * }
   * ```
   * Error: "Multiple languages require exactly one * marker to indicate the default"
   *
   * @example Invalid: Multiple default markers
   * ```eligian
   * languages {
   *   * "en-US" "English"
   *   * "nl-NL" "Nederlands"  // ❌ Two markers
   * }
   * ```
   * Error: "Only one language can be marked as default"
   */
  checkDefaultMarker(
    block: LanguagesBlock,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates no duplicate language codes
   *
   * Rule: FR-006
   * Each language code must appear at most once within a LanguagesBlock.
   *
   * @param block - LanguagesBlock AST node
   * @param accept - ValidationAcceptor for reporting errors
   *
   * @example Valid: Unique codes
   * ```eligian
   * languages {
   *   "en-US" "English"
   *   "nl-NL" "Nederlands"
   * }
   * ```
   *
   * @example Invalid: Duplicate code
   * ```eligian
   * languages {
   *   "en-US" "English"
   *   "en-US" "American English"  // ❌ Duplicate
   * }
   * ```
   * Error: "Duplicate language code: 'en-US'"
   *
   * Implementation:
   * - Track seen codes in a Set
   * - Report error on second occurrence
   * - Attach error to the duplicate LanguageEntry node
   */
  checkDuplicateLanguageCodes(
    block: LanguagesBlock,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates only one languages block per file
   *
   * Rule: FR-011
   * Grammar enforces this (Program.languages is singular, not array),
   * but include defensive check if grammar allows duplicates.
   *
   * @param program - Program AST node
   * @param accept - ValidationAcceptor for reporting errors
   *
   * @example Valid: Single languages block
   * ```eligian
   * languages { "en-US" "English" }
   * timeline "Demo" at 0s { ... }
   * ```
   *
   * @example Invalid: Multiple languages blocks
   * ```eligian
   * languages { "en-US" "English" }
   * languages { "nl-NL" "Nederlands" }  // ❌ Only one allowed
   * ```
   * Error: "Only one languages block allowed per file"
   */
  checkSingleLanguagesBlock(
    program: Program,
    accept: ValidationAcceptor
  ): void;

  /**
   * Validates at least one language entry per block
   *
   * Rule: FR-012
   * Grammar enforces this (entries+=LanguageEntry+), but include
   * defensive check for empty blocks.
   *
   * @param block - LanguagesBlock AST node
   * @param accept - ValidationAcceptor for reporting errors
   *
   * @example Valid: At least one entry
   * ```eligian
   * languages { "en-US" "English" }
   * ```
   *
   * @example Invalid: Empty block
   * ```eligian
   * languages { }  // ❌ At least one language required
   * ```
   * Error: "Languages block cannot be empty"
   */
  checkNonEmptyLanguagesBlock(
    block: LanguagesBlock,
    accept: ValidationAcceptor
  ): void;
}

/**
 * Validation Summary
 *
 * Program-level validators:
 * - checkLanguagesBlockPosition: FR-004 (first declaration)
 * - checkSingleLanguagesBlock: FR-011 (only one block)
 *
 * LanguagesBlock-level validators:
 * - checkDefaultMarker: FR-002, FR-003 (default marker rules)
 * - checkDuplicateLanguageCodes: FR-006 (no duplicates)
 * - checkNonEmptyLanguagesBlock: FR-012 (at least one entry)
 *
 * LanguageEntry-level validators:
 * - checkLanguageCodeFormat: FR-005 (IETF xx-XX format)
 *
 * Total: 6 validation rules
 */
