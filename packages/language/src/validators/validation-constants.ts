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
 * These are the grammar's reserved keywords (statement/declaration starters and
 * literals). Contextual keywords such as `at`, `from`, `as`, `layout` or
 * `event` are valid names (the `Identifier` rule in eligian.langium) and are
 * deliberately not listed.
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
  'true',
  'false',
  'null',
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
