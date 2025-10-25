/**
 * Validation Constants for Import Statements
 *
 * Shared constants used across import validators.
 * Separating these from validator logic makes them easy to update and test.
 *
 * @module validation-constants
 */

import type { AssetType } from '../utils/asset-type-inference.js';

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
 * File extension to asset type mapping
 *
 * Used by type inference validators to determine asset type from file path.
 * Extensions are intentionally limited to unambiguous cases.
 *
 * **Excluded extensions**:
 * - `.ogg` - Ambiguous (could be audio or video), requires explicit type
 */
export const EXTENSION_MAP: Record<string, AssetType> = {
  html: 'html',
  css: 'css',
  mp4: 'media',
  webm: 'media',
  mp3: 'media',
  wav: 'media',
};

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
