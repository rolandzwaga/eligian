/**
 * Custom Typir Types for Eligian DSL Constructs
 *
 * These TypeScript type definitions specify the structure of custom Typir types
 * used for type inference, validation, and hover information in the Eligian DSL.
 *
 * @module contracts/typir-types
 */

/**
 * AssetType - Type of asset being imported
 * - 'html': HTML layouts, content snippets
 * - 'css': CSS stylesheets, class definitions
 * - 'media': Video/audio files (timeline providers)
 */
export type AssetType = 'html' | 'css' | 'media';

/**
 * Reserved keywords that cannot be used as constant names
 *
 * These keywords are part of Eligian DSL syntax and cannot be used
 * as identifiers for constants.
 */
export const RESERVED_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'in',
  'break',
  'continue',
  'const',
  'action',
  'endable',
  'timeline',
  'at',
  'sequence',
  'stagger',
  'import',
  'from',
  'as',
  'layout',
  'styles',
  'provider',
  'using',
]);
