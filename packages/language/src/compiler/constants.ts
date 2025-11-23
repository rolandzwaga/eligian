/**
 * Compiler Constants
 *
 * Centralized constants used throughout the compilation pipeline.
 */

// ============================================================================
// Language Code Validation (Feature 037)
// ============================================================================

/**
 * IETF BCP 47 language code format validation regex
 *
 * Format: xx-XX (primary-REGION)
 * - Primary language: 2-3 lowercase letters (e.g., 'en', 'nl', 'pt')
 * - Hyphen: '-'
 * - Region: 2-3 uppercase letters (e.g., 'US', 'NL', 'BR')
 *
 * Valid examples:
 * - en-US (English - United States)
 * - nl-NL (Dutch - Netherlands)
 * - pt-BR (Portuguese - Brazil)
 * - fr-FR (French - France)
 *
 * Invalid examples:
 * - EN-US (uppercase primary)
 * - en-us (lowercase region)
 * - english (no region)
 * - en_US (underscore instead of hyphen)
 *
 * Feature 037: Languages Declaration Syntax
 * Research Decision: RT-002
 */
export const LANGUAGE_CODE_REGEX = /^[a-z]{2,3}-[A-Z]{2,3}$/;
