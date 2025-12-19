/**
 * Validation Constants for Import Statements
 *
 * Shared constants used across import validators.
 * Separating these from validator logic makes them easy to update and test.
 *
 * @module validation-constants
 */

/**
 * Reserved keywords that cannot be used as import names
 *
 * Includes:
 * - Control flow keywords (if, else, for, break, continue)
 * - Declaration keywords (action, timeline, at)
 * - Import-specific keywords (layout, styles, provider, import, from, as)
 * - Boolean literals (true, false)
 */
export const RESERVED_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'break',
  'continue',
  'at',
  'action',
  'timeline',
  'layout',
  'styles',
  'provider',
  'import',
  'from',
  'as',
  'true',
  'false',
]);

/**
 * Ambiguous file extensions that require explicit type specification
 *
 * These extensions cannot be automatically inferred because they could map to
 * multiple asset types.
 *
 * Example: `.ogg` could be audio (media) or video (media), but requires explicit
 * clarification via `as media` syntax.
 */
export const AMBIGUOUS_EXTENSIONS = new Set(['ogg']);
