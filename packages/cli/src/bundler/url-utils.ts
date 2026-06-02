/**
 * URL / asset-path utilities (single source of truth)
 *
 * Shared helpers for classifying URLs (external vs data URI) and resolving
 * relative asset references against a containing file. Previously these were
 * copy-pasted across asset-collector.ts, css-processor.ts, and html-generator.ts
 * (D31).
 */

import * as path from 'node:path';

/**
 * Check if a URL is external (http://, https://, or protocol-relative //)
 */
export function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

/**
 * Check if a URL is a data URI
 */
export function isDataUri(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Resolve a relative URL reference against the directory of a containing file.
 *
 * @param urlRef - The URL reference (e.g., "./images/hero.png")
 * @param containingFilePath - Absolute path to the file the reference appears in
 *   (CSS or HTML file)
 * @returns Absolute path to the referenced asset
 */
export function resolveAssetPath(urlRef: string, containingFilePath: string): string {
  const baseDir = path.dirname(containingFilePath);
  return path.resolve(baseDir, urlRef);
}
