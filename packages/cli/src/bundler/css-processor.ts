/**
 * CSS Processor Module
 *
 * Combines multiple CSS files into a single string, rewriting all url()
 * references to point to the bundle's asset paths or inline data URIs.
 * Optionally minifies the combined CSS output.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Effect } from 'effect';
import * as esbuild from 'esbuild';
import { type AssetManifest, CSSProcessError } from './types.js';

/**
 * Options for CSS processing
 */
interface CSSProcessOptions {
  /**
   * Whether to minify the combined CSS output
   * @default false
   */
  minify?: boolean;
}

/**
 * Minify CSS content using esbuild
 *
 * @param css - CSS content to minify
 * @returns Minified CSS string
 */
export async function minifyCSS(css: string): Promise<string> {
  const result = await esbuild.transform(css, {
    loader: 'css',
    minify: true,
  });
  return result.code;
}

/**
 * Check if a URL is external (http:// or https://)
 */
function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

/**
 * Check if a URL is a data URI
 */
function isDataUri(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Resolve a URL reference relative to a CSS file path
 *
 * @param urlRef - The URL reference from the CSS (e.g., "./images/hero.png")
 * @param cssFilePath - Absolute path to the CSS file
 * @returns Absolute path to the referenced asset
 */
function resolveUrl(urlRef: string, cssFilePath: string): string {
  const cssDir = path.dirname(cssFilePath);
  return path.resolve(cssDir, urlRef);
}

/**
 * URL regex pattern for matching url() in CSS
 * Matches: url("..."), url('...'), url(...)
 */
const URL_REGEX = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/**
 * Rewrite a single CSS file's URLs based on asset manifest
 *
 * @param cssContent - CSS content string
 * @param cssFilePath - Absolute path to the CSS file (for resolving relative URLs)
 * @param manifest - Asset manifest containing resolved paths and inline decisions
 * @returns Processed CSS string with rewritten URLs
 */
export function rewriteCSSUrls(
  cssContent: string,
  cssFilePath: string,
  manifest: AssetManifest
): string {
  if (!cssContent || cssContent.trim() === '') {
    return cssContent;
  }

  return cssContent.replace(URL_REGEX, (match, _quote, url: string) => {
    const trimmedUrl = url.trim();

    // Skip external URLs and data URIs
    if (isExternalUrl(trimmedUrl) || isDataUri(trimmedUrl)) {
      return match;
    }

    // Resolve the URL to an absolute path
    const resolvedPath = resolveUrl(trimmedUrl, cssFilePath);

    // Look up in manifest
    const asset = manifest.assets.get(resolvedPath);

    if (!asset) {
      // Asset not in manifest - leave unchanged
      // Error will be reported elsewhere during asset collection
      return match;
    }

    // If asset should be inlined and has data URI, use it
    if (asset.inline && asset.dataUri) {
      return `url('${asset.dataUri}')`;
    }

    // Otherwise use the output path
    return `url('${asset.outputPath}')`;
  });
}

/**
 * Process CSS files: combine, rewrite URLs, optionally minify
 *
 * Combines multiple CSS files in order, adding source comments for debugging,
 * rewrites all url() references based on the asset manifest, and optionally
 * minifies the output.
 *
 * @param cssFiles - Array of absolute CSS file paths (in order)
 * @param manifest - Asset manifest with inline decisions
 * @param basePath - Base path for resolving relative references
 * @param options - Processing options (minify, etc.)
 * @returns Effect that resolves to processed CSS string
 */
export function processCSS(
  cssFiles: string[],
  manifest: AssetManifest,
  _basePath: string,
  options?: CSSProcessOptions
): Effect.Effect<string, CSSProcessError> {
  return Effect.gen(function* () {
    if (cssFiles.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (const cssFilePath of cssFiles) {
      // Read CSS file
      const cssContent = yield* Effect.tryPromise({
        try: () => fs.readFile(cssFilePath, 'utf-8'),
        catch: error =>
          new CSSProcessError(`Failed to read CSS file: ${cssFilePath}: ${error}`, cssFilePath),
      });

      // Get filename for source comment (only if not minifying)
      if (!options?.minify) {
        const fileName = path.basename(cssFilePath);
        parts.push(`/* === Source: ${fileName} === */`);
      }

      // Rewrite URLs and add content
      const processedContent = rewriteCSSUrls(cssContent, cssFilePath, manifest);
      parts.push(processedContent);

      // Add spacing between files (only if not minifying)
      if (!options?.minify) {
        parts.push('');
      }
    }

    let result = parts.join('\n').trim();

    // Minify if requested
    if (options?.minify) {
      result = yield* Effect.tryPromise({
        try: () => minifyCSS(result),
        catch: error => new CSSProcessError(`CSS minification failed: ${error}`),
      });
    }

    return result;
  });
}
