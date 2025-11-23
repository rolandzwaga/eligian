/**
 * Grammar Rules: Languages Declaration Syntax
 * Feature: 037-languages-syntax
 *
 * These rules define the syntax for declaring presentation languages.
 */

// ============================================================================
// Program Rule (Modified)
// ============================================================================

Program:
  languages=LanguagesBlock?        // Optional, must be first if present
  (statements += ProgramStatement)*;

// ============================================================================
// Languages Block
// ============================================================================

LanguagesBlock:
  'languages' '{'
    entries+=LanguageEntry+        // One or more language entries required
  '}';

// ============================================================================
// Language Entry
// ============================================================================

LanguageEntry:
  isDefault?='*'?                  // Optional * marker for default language
  code=STRING                      // Language code (e.g., "en-US")
  label=STRING;                    // Display label (e.g., "English")

// ============================================================================
// Notes
// ============================================================================

/**
 * Position Enforcement:
 * - Grammar-level: LanguagesBlock is the first element in Program rule
 * - This enforces that languages block (if present) must appear before all other declarations
 *
 * Default Marker Rules:
 * - Single language: isDefault is optional (implicitly default)
 * - Multiple languages: Exactly one entry must have isDefault=true (validated in eligian-validator.ts)
 *
 * Validation Rules (eligian-validator.ts):
 * - Language code format: /^[a-z]{2,3}-[A-Z]{2,3}$/ (IETF BCP 47)
 * - No duplicate language codes
 * - Single languages block per file
 * - At least one entry per block
 */
