/**
 * Asset Type Inference Utility
 *
 * Provides pure functions for inferring asset types from file extensions.
 * Used by import validators to determine whether explicit type override is needed.
 *
 * @module asset-type-inference
 */

/**
 * Supported asset types for Eligian imports
 */
export type AssetType = 'html' | 'css' | 'media';

/**
 * File extension to asset type mapping
 *
 * Extensions are intentionally limited to unambiguous cases.
 * Ambiguous extensions (like .ogg) are excluded and require explicit type override.
 */
const EXTENSION_MAP: Record<string, AssetType> = {
  html: 'html',
  css: 'css',
  mp4: 'media',
  webm: 'media',
  mp3: 'media',
  wav: 'media',
  // .ogg intentionally excluded - ambiguous (could be audio or video)
};

/**
 * Infers asset type from file path extension
 *
 * @param path - File path from import statement (e.g., './layout.html', '../theme.css')
 * @returns Asset type if extension is recognized, undefined otherwise
 *
 * **Behavior**:
 * - Case-insensitive: `.HTML` → `'html'`, `.CSS` → `'css'`
 * - Multiple extensions: Uses final extension (`.min.html` → `'html'`)
 * - Unknown extensions: Returns `undefined` (requires explicit `as type` suffix)
 * - Ambiguous extensions (`.ogg`): Returns `undefined` (requires explicit type)
 *
 * **Examples**:
 * ```typescript
 * inferAssetType('./file.html')      // → 'html'
 * inferAssetType('./file.HTML')      // → 'html' (case-insensitive)
 * inferAssetType('./file.css')       // → 'css'
 * inferAssetType('./file.mp4')       // → 'media'
 * inferAssetType('./file.xyz')       // → undefined (unknown)
 * inferAssetType('./file.ogg')       // → undefined (ambiguous)
 * inferAssetType('./file.min.html')  // → 'html' (uses final extension)
 * ```
 */
export function inferAssetType(path: string | undefined): AssetType | undefined {
  // Handle undefined/empty path
  if (!path) return undefined;

  // Extract final extension (after last dot)
  const ext = path.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (!ext) return undefined;

  // Look up in extension map
  return EXTENSION_MAP[ext];
}
