/**
 * Asset Type Inference
 *
 * Infers asset type from file extension.
 *
 * @module utils/asset-type-inferrer
 */

import type { AssetType } from '../types/typir-types.js';

/**
 * Infer asset type from file extension
 *
 * Supported extensions:
 * - CSS: .css
 * - HTML: .html, .htm
 * - Media: .mp4, .webm, .ogg (video), .mp3, .wav (audio)
 *
 * Unknown extensions default to 'html'.
 *
 * @param path - File path (relative or absolute)
 * @returns Inferred asset type
 *
 * @example
 * ```typescript
 * inferAssetTypeFromExtension('./styles.css')  // Returns: 'css'
 * inferAssetTypeFromExtension('./video.mp4')   // Returns: 'media'
 * inferAssetTypeFromExtension('./layout.html') // Returns: 'html'
 * inferAssetTypeFromExtension('./unknown.txt') // Returns: 'html' (default)
 * ```
 */
export function inferAssetTypeFromExtension(path: string): AssetType {
  // Extract extension (last part after final dot, case-insensitive)
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'css':
      return 'css';

    case 'html':
    case 'htm':
      return 'html';

    case 'mp4':
    case 'webm':
    case 'ogg':
    case 'mp3':
    case 'wav':
      return 'media';

    default:
      // Default to html for unknown extensions
      return 'html';
  }
}
