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
 * - 'json': Locale/translation files (locales imports)
 */
export type AssetType = 'html' | 'css' | 'media' | 'json';

/**
 * Reserved keywords that cannot be used as constant names
 *
 * These are the grammar's reserved keywords (statement/declaration starters).
 * Contextual keywords such as `in`, `at`, `from`, `as`, `layout` or
 * `using` are valid names (the `Identifier` rule in eligian.langium).
 */
export const RESERVED_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'break',
  'continue',
  'const',
  'action',
  'endable',
  'on',
  'timeline',
  'sequence',
  'stagger',
  'import',
]);
