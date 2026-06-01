/**
 * Shared `_tag` discriminator guard for Eligian's discriminated-union errors.
 *
 * Every error type in the toolchain discriminates on a string `_tag` field.
 * The runtime check is always the same three steps (object, non-null, matching
 * `_tag`); this helper is the single source of truth so individual type guards
 * become one-liners instead of repeating the boilerplate.
 *
 * @module tag-guard
 */

/**
 * Check whether `error` is a tagged object whose `_tag` equals `tag`.
 *
 * @param error - Value to check (typically `unknown` from a catch/Effect channel)
 * @param tag - Expected `_tag` discriminator
 * @returns True if `error` is an object with `_tag === tag`
 *
 * @example
 * ```typescript
 * export function isParseError(error: unknown): error is ParseError {
 *   return hasTag(error, 'ParseError');
 * }
 * ```
 */
export function hasTag<T extends string>(error: unknown, tag: T): error is { _tag: T } {
  return (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    (error as { _tag: unknown })._tag === tag
  );
}
