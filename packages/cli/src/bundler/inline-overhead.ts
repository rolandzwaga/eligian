/**
 * Inline Overhead Calculation Module
 *
 * Calculates the overhead introduced by base64 encoding when inlining assets.
 * Base64 encoding typically increases size by ~33% (4/3 ratio), plus the
 * data URI prefix adds additional overhead (~37% total).
 *
 * SC-006: Image inlining reduces HTTP requests without increasing total
 * bundle size by more than 33% (base64 overhead threshold).
 */

import type { AssetEntry } from './types.js';

/**
 * Result of inline overhead calculation
 */
interface InlineOverheadResult {
  /** Total original size of all inlined assets (bytes) */
  inlinedOriginalSize: number;
  /** Total encoded size of all inlined assets (data URI length) */
  inlinedEncodedSize: number;
  /** Percentage overhead: ((encoded - original) / original) * 100 */
  inlineOverheadPercent: number;
}

/**
 * Calculate the overhead introduced by base64 inlining
 *
 * Iterates through all assets in the manifest, summing the original sizes
 * and encoded sizes of inlined assets to compute the overhead percentage.
 *
 * @param assets - Map of asset entries from the manifest
 * @returns Overhead statistics for inlined assets
 *
 * @example
 * ```typescript
 * const result = calculateInlineOverhead(manifest.assets);
 * if (result.inlineOverheadPercent > 33) {
 *   console.warn('Base64 overhead exceeds 33% threshold');
 * }
 * ```
 */
export function calculateInlineOverhead(assets: Map<string, AssetEntry>): InlineOverheadResult {
  let inlinedOriginalSize = 0;
  let inlinedEncodedSize = 0;

  for (const asset of assets.values()) {
    if (asset.inline) {
      inlinedOriginalSize += asset.size;
      // Use dataUri length if available, otherwise 0
      inlinedEncodedSize += asset.dataUri?.length ?? 0;
    }
  }

  // Calculate percentage overhead
  // If no assets were inlined, overhead is 0%
  const inlineOverheadPercent =
    inlinedOriginalSize > 0
      ? ((inlinedEncodedSize - inlinedOriginalSize) / inlinedOriginalSize) * 100
      : 0;

  return {
    inlinedOriginalSize,
    inlinedEncodedSize,
    inlineOverheadPercent,
  };
}
