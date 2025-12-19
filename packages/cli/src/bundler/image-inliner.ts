/**
 * Image Inliner Module
 *
 * Converts images to base64 data URIs for embedding in CSS or HTML.
 * Handles MIME type detection and respects size thresholds.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Effect } from 'effect';
import {
  getMimeType,
  ImageInlineError,
  type InlineDecision,
  NEVER_INLINE_EXTENSIONS,
} from './types.js';

/**
 * Convert an image file to a base64 data URI
 *
 * SVG files are URL-encoded instead of base64 for smaller output.
 * All other formats use standard base64 encoding.
 *
 * @param filePath - Absolute path to the image file
 * @returns Effect that resolves to data URI string
 */
export function inlineImage(filePath: string): Effect.Effect<string, ImageInlineError> {
  return Effect.gen(function* () {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = getMimeType(ext);

    // Read file content
    let content: Buffer;
    try {
      content = yield* Effect.tryPromise({
        try: () => fs.readFile(filePath),
        catch: error => new ImageInlineError(`Failed to read image file: ${error}`, filePath),
      });
    } catch (error) {
      return yield* Effect.fail(
        new ImageInlineError(`Failed to read image file: ${error}`, filePath)
      );
    }

    // SVG: Use URL encoding for smaller output
    if (ext === '.svg') {
      const svgContent = content.toString('utf-8');
      const encoded = encodeURIComponent(svgContent).replace(/'/g, '%27').replace(/"/g, '%22');
      return `data:${mimeType},${encoded}`;
    }

    // All other formats: Use base64 encoding
    const base64 = content.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  });
}

/**
 * Check if a file should be inlined based on size and type
 *
 * Media files (video/audio) are never inlined regardless of size.
 * Other files are inlined if their size is below the threshold.
 *
 * @param filePath - Absolute path to the file
 * @param threshold - Maximum size in bytes for inlining
 * @returns Effect that resolves to inlining decision with metadata
 */
export function shouldInline(
  filePath: string,
  threshold: number
): Effect.Effect<InlineDecision, ImageInlineError> {
  return Effect.gen(function* () {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = getMimeType(ext);

    // Get file stats
    let stats: { size: number };
    try {
      stats = yield* Effect.tryPromise({
        try: () => fs.stat(filePath),
        catch: error => new ImageInlineError(`Failed to stat file: ${error}`, filePath),
      });
    } catch (error) {
      return yield* Effect.fail(new ImageInlineError(`Failed to stat file: ${error}`, filePath));
    }

    // Never inline media files (video/audio)
    if (NEVER_INLINE_EXTENSIONS.has(ext)) {
      return {
        shouldInline: false,
        size: stats.size,
        mimeType,
        reason: 'never-inline-type' as const,
      };
    }

    // Check size threshold
    if (stats.size > threshold) {
      return {
        shouldInline: false,
        size: stats.size,
        mimeType,
        reason: 'over-threshold' as const,
      };
    }

    // File can be inlined
    return {
      shouldInline: true,
      size: stats.size,
      mimeType,
      reason: 'under-threshold' as const,
    };
  });
}
