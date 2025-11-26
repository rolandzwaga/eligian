/**
 * Asset Collector Module
 *
 * Collects all assets referenced in CSS files and configuration,
 * building a manifest for the bundler. Resolves relative paths and
 * determines which assets should be inlined vs copied.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import {
  type AssetEntry,
  type AssetManifest,
  AssetNotFoundError,
  type AssetSource,
  CSSProcessError,
  canInline,
  getMimeType,
  NEVER_INLINE_EXTENSIONS,
} from './types.js';

/**
 * Options for asset collection
 */
export interface CollectOptions {
  /**
   * Threshold in bytes for inlining images
   * Images smaller than this will be inlined as base64 data URIs
   * Set to 0 to disable inlining entirely
   */
  inlineThreshold: number;

  /**
   * Optional layout template HTML content
   * If provided, assets referenced in the layout template will be collected
   */
  layoutTemplate?: string;

  /**
   * Base path for resolving layout template asset references
   * Required if layoutTemplate is provided
   */
  layoutTemplatePath?: string;
}

/**
 * URL regex pattern for extracting url() from CSS
 */
const URL_REGEX = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/**
 * Regex for src attribute on img, source, video, audio elements
 * Handles both single and double quotes
 */
const HTML_SRC_COMBINED_REGEX = /<(?:img|source|video|audio)[^>]*\ssrc\s*=\s*(['"])([^'"]+)\1/gi;

/**
 * Regex for poster attribute on video elements
 */
const HTML_POSTER_COMBINED_REGEX = /<video[^>]*\sposter\s*=\s*(['"])([^'"]+)\1/gi;

/**
 * Regex for srcset attribute (handles both quotes)
 */
const HTML_SRCSET_COMBINED_REGEX = /srcset\s*=\s*(['"])([^'"]+)\1/gi;

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
 * CSS URL reference with line number
 */
export interface CSSUrlRef {
  /** The URL path extracted from url() */
  url: string;
  /** 1-indexed line number where the URL was found */
  line: number;
}

/**
 * Extract url() references from CSS content with line numbers
 *
 * Returns all local URLs with their line numbers (does not deduplicate).
 * Useful for error reporting with source locations.
 *
 * @param cssContent - CSS content string
 * @returns Array of { url, line } objects
 */
export function extractCSSUrlsWithLines(cssContent: string): CSSUrlRef[] {
  const results: CSSUrlRef[] = [];
  const lines = cssContent.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    // Reset regex state for each line
    URL_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = URL_REGEX.exec(line)) !== null) {
      const url = match[2].trim();

      // Skip external URLs and data URIs
      if (isExternalUrl(url) || isDataUri(url)) {
        continue;
      }

      results.push({
        url,
        line: lineIndex + 1, // 1-indexed
      });
    }
  }

  return results;
}

/**
 * Extract url() references from CSS content
 *
 * Returns unique, local URLs only (skips external and data URIs)
 *
 * @param cssContent - CSS content string
 * @returns Array of unique URL references
 */
export function extractCSSUrls(cssContent: string): string[] {
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset regex state
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(cssContent)) !== null) {
    const url = match[2].trim();

    // Skip external URLs and data URIs
    if (isExternalUrl(url) || isDataUri(url)) {
      continue;
    }

    urls.add(url);
  }

  return [...urls];
}

/**
 * Parse srcset attribute value and extract individual URLs
 *
 * srcset format: "url1 1x, url2 2x" or "url1 480w, url2 800w"
 *
 * @param srcsetValue - The srcset attribute value
 * @returns Array of URLs extracted from srcset
 */
function parseSrcset(srcsetValue: string): string[] {
  const urls: string[] = [];
  // Split by comma, then extract URL (first part before space or whole value)
  const entries = srcsetValue.split(',');
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed) {
      // URL is everything before the first space (if any)
      const spaceIndex = trimmed.indexOf(' ');
      const url = spaceIndex > 0 ? trimmed.substring(0, spaceIndex) : trimmed;
      if (url) {
        urls.push(url);
      }
    }
  }
  return urls;
}

/**
 * Extract asset URLs from HTML content
 *
 * Extracts src attributes from img, source, video, audio elements,
 * poster attributes from video elements, and srcset attributes.
 * Returns unique, local URLs only (skips external and data URIs).
 *
 * @param htmlContent - HTML content string
 * @returns Array of unique URL references
 */
export function extractHTMLUrls(htmlContent: string): string[] {
  const urls = new Set<string>();

  // Reset regex state
  HTML_SRC_COMBINED_REGEX.lastIndex = 0;
  HTML_POSTER_COMBINED_REGEX.lastIndex = 0;
  HTML_SRCSET_COMBINED_REGEX.lastIndex = 0;

  // Extract src attributes from img, source, video, audio
  let match: RegExpExecArray | null;
  while ((match = HTML_SRC_COMBINED_REGEX.exec(htmlContent)) !== null) {
    const url = match[2].trim();
    if (!isExternalUrl(url) && !isDataUri(url)) {
      urls.add(url);
    }
  }

  // Extract poster attributes from video elements
  while ((match = HTML_POSTER_COMBINED_REGEX.exec(htmlContent)) !== null) {
    const url = match[2].trim();
    if (!isExternalUrl(url) && !isDataUri(url)) {
      urls.add(url);
    }
  }

  // Extract srcset attributes
  while ((match = HTML_SRCSET_COMBINED_REGEX.exec(htmlContent)) !== null) {
    const srcsetValue = match[2];
    const srcsetUrls = parseSrcset(srcsetValue);
    for (const url of srcsetUrls) {
      if (!isExternalUrl(url) && !isDataUri(url)) {
        urls.add(url);
      }
    }
  }

  return [...urls];
}

/**
 * Resolve a URL reference relative to a CSS file path
 *
 * @param urlRef - The URL reference from the CSS (e.g., "./images/hero.png")
 * @param cssFilePath - Absolute path to the CSS file
 * @returns Absolute path to the referenced asset
 */
export function resolveAssetPath(urlRef: string, cssFilePath: string): string {
  const cssDir = path.dirname(cssFilePath);
  return path.resolve(cssDir, urlRef);
}

/**
 * Extract asset paths from Eligius configuration
 *
 * Extracts media source paths from timeline provider settings
 * (video, audio sources that should be copied to assets)
 *
 * @param config - Eligius configuration object
 * @param basePath - Base path for resolving relative references
 * @returns Array of { absolutePath, originalRef, sourceType }
 */
function extractConfigAssets(
  config: IEngineConfiguration,
  basePath: string
): Array<{ absolutePath: string; originalRef: string; sourceType: 'config' }> {
  const assets: Array<{ absolutePath: string; originalRef: string; sourceType: 'config' }> = [];

  const settings = config.timelineProviderSettings;
  if (!settings) {
    return assets;
  }

  // The ITimelineProviderSettings interface uses 'animation' | 'mediaplayer' as keys,
  // but at runtime the settings object may have provider-specific properties like src/path.
  // We iterate over all settings entries to extract media source paths.
  for (const providerSettings of Object.values(settings)) {
    if (!providerSettings) continue;

    // Check for video/audio src property
    const settingsWithSrc = providerSettings as { src?: string };
    if (
      settingsWithSrc.src &&
      !isExternalUrl(settingsWithSrc.src) &&
      !isDataUri(settingsWithSrc.src)
    ) {
      assets.push({
        absolutePath: path.resolve(basePath, settingsWithSrc.src),
        originalRef: settingsWithSrc.src,
        sourceType: 'config',
      });
    }

    // Check for lottie path property
    const settingsWithPath = providerSettings as { path?: string };
    if (
      settingsWithPath.path &&
      !isExternalUrl(settingsWithPath.path) &&
      !isDataUri(settingsWithPath.path)
    ) {
      assets.push({
        absolutePath: path.resolve(basePath, settingsWithPath.path),
        originalRef: settingsWithPath.path,
        sourceType: 'config',
      });
    }
  }

  return assets;
}

/**
 * Determine if an asset should be inlined based on size and type
 *
 * @param extension - File extension (e.g., ".png")
 * @param size - File size in bytes
 * @param threshold - Size threshold for inlining
 * @returns true if the asset should be inlined
 */
function shouldInlineAsset(extension: string, size: number, threshold: number): boolean {
  // Never inline media files
  if (NEVER_INLINE_EXTENSIONS.has(extension.toLowerCase())) {
    return false;
  }

  // Check if type can be inlined and size is under threshold
  return canInline(extension) && threshold > 0 && size <= threshold;
}

/**
 * Tracking structure for output path collisions
 */
interface OutputPathTracker {
  /**
   * Map of output path -> source path that claimed it
   */
  usedPaths: Map<string, string>;

  /**
   * List of detected collisions for logging
   */
  collisions: Array<{
    fileName: string;
    source1: string;
    source2: string;
    resolvedPath: string;
  }>;
}

/**
 * Generate a unique output filename for an asset, handling collisions
 *
 * If two different source files have the same filename, adds an 8-character
 * hash suffix to distinguish them.
 *
 * @param sourcePath - Absolute path to the source file
 * @param tracker - Tracker for used output paths and collisions
 * @returns Output path relative to bundle root (e.g., "assets/hero.png" or "assets/hero-a1b2c3d4.png")
 */
export function generateUniqueOutputPath(sourcePath: string, tracker: OutputPathTracker): string {
  const fileName = path.basename(sourcePath);
  const baseName = path.basename(fileName, path.extname(fileName));
  const ext = path.extname(fileName);

  let outputPath = `assets/${fileName}`;

  // Check for collision with a different source file
  const existingSource = tracker.usedPaths.get(outputPath);
  if (existingSource && existingSource !== sourcePath) {
    // Collision detected - add hash from source path
    const hash = createHash('md5').update(sourcePath).digest('hex').slice(0, 8);
    outputPath = `assets/${baseName}-${hash}${ext}`;

    // Track collision for logging
    tracker.collisions.push({
      fileName,
      source1: existingSource,
      source2: sourcePath,
      resolvedPath: outputPath,
    });
  }

  tracker.usedPaths.set(outputPath, sourcePath);
  return outputPath;
}

/**
 * Create a new output path tracker
 */
export function createOutputPathTracker(): OutputPathTracker {
  return {
    usedPaths: new Map(),
    collisions: [],
  };
}

/**
 * Log any detected collisions as warnings
 */
export function logCollisionWarnings(tracker: OutputPathTracker): void {
  for (const collision of tracker.collisions) {
    console.warn(`⚠ Asset filename collision detected: ${collision.fileName}`);
    console.warn(`  Source 1: ${collision.source1}`);
    console.warn(`  Source 2: ${collision.source2}`);
    console.warn(`  Resolved to: ${collision.resolvedPath}`);
  }
}

/**
 * Create a base64 data URI for a file
 *
 * @param filePath - Absolute path to the file
 * @param mimeType - MIME type of the file
 * @returns Base64 data URI string
 */
async function createDataUri(filePath: string, mimeType: string): Promise<string> {
  const content = await fs.readFile(filePath);
  const base64 = content.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Result of asset collection including collision info
 */
export interface CollectAssetsResult {
  manifest: AssetManifest;
  collisions: OutputPathTracker['collisions'];
}

/**
 * Collect all assets from CSS files and configuration
 *
 * Walks through CSS files extracting url() references, resolves paths,
 * reads file metadata, and builds an asset manifest with inline decisions.
 * Detects and handles filename collisions by adding hash suffixes.
 *
 * @param config - Compiled Eligius configuration
 * @param cssFiles - Array of absolute CSS file paths
 * @param basePath - Base path for resolving relative references
 * @param options - Collection options (inline threshold)
 * @returns Effect that resolves to AssetManifest
 */
export function collectAssets(
  config: IEngineConfiguration,
  cssFiles: string[],
  basePath: string,
  options: CollectOptions
): Effect.Effect<AssetManifest, AssetNotFoundError | CSSProcessError> {
  return Effect.gen(function* () {
    const assets = new Map<string, AssetEntry>();
    const pathTracker = createOutputPathTracker();

    // Collect assets from CSS files
    for (const cssFilePath of cssFiles) {
      // Read CSS file
      const cssContent = yield* Effect.tryPromise({
        try: () => fs.readFile(cssFilePath, 'utf-8'),
        catch: error =>
          new CSSProcessError(`Failed to read CSS file: ${cssFilePath}: ${error}`, cssFilePath),
      });

      // Extract URLs from CSS with line numbers for better error reporting
      const urlRefs = extractCSSUrlsWithLines(cssContent);

      // Process each URL
      for (const { url: urlRef, line } of urlRefs) {
        const absolutePath = resolveAssetPath(urlRef, cssFilePath);

        // Check if asset exists (include source location in error)
        const stat = yield* Effect.tryPromise({
          try: () => fs.stat(absolutePath),
          catch: () =>
            new AssetNotFoundError(absolutePath, cssFilePath, {
              file: cssFilePath,
              line,
              column: 0, // Column requires more complex parsing
            }),
        });

        const extension = path.extname(absolutePath);
        const mimeType = getMimeType(extension);
        const shouldInline = shouldInlineAsset(extension, stat.size, options.inlineThreshold);

        // Create or update asset entry
        if (assets.has(absolutePath)) {
          // Add source to existing entry
          const existing = assets.get(absolutePath)!;
          existing.sources.push({
            file: cssFilePath,
            type: 'css-url',
            line,
          });
        } else {
          // Create new entry
          const source: AssetSource = {
            file: cssFilePath,
            type: 'css-url',
            line,
          };

          let dataUri: string | undefined;
          if (shouldInline) {
            dataUri = yield* Effect.tryPromise({
              try: () => createDataUri(absolutePath, mimeType),
              catch: () =>
                new CSSProcessError(`Failed to read asset: ${absolutePath}`, cssFilePath, line),
            });
          }

          const entry: AssetEntry = {
            originalRef: urlRef,
            sourcePath: absolutePath,
            outputPath: generateUniqueOutputPath(absolutePath, pathTracker),
            size: stat.size,
            inline: shouldInline,
            dataUri,
            mimeType,
            sources: [source],
          };

          assets.set(absolutePath, entry);
        }
      }
    }

    // Collect assets from configuration (video, audio, lottie sources)
    const configAssets = extractConfigAssets(config, basePath);

    for (const { absolutePath, originalRef, sourceType } of configAssets) {
      // Check if asset exists
      const stat = yield* Effect.tryPromise({
        try: () => fs.stat(absolutePath),
        catch: () => new AssetNotFoundError(absolutePath, 'configuration'),
      });

      const extension = path.extname(absolutePath);
      const mimeType = getMimeType(extension);
      // Config assets (video, audio) are never inlined
      const shouldInline = false;

      if (assets.has(absolutePath)) {
        // Add source to existing entry
        const existing = assets.get(absolutePath)!;
        existing.sources.push({
          file: 'configuration',
          type: sourceType,
        });
      } else {
        const source: AssetSource = {
          file: 'configuration',
          type: sourceType,
        };

        const entry: AssetEntry = {
          originalRef,
          sourcePath: absolutePath,
          outputPath: generateUniqueOutputPath(absolutePath, pathTracker),
          size: stat.size,
          inline: shouldInline,
          mimeType,
          sources: [source],
        };

        assets.set(absolutePath, entry);
      }
    }

    // Collect assets from layout template HTML (if provided)
    if (options.layoutTemplate && options.layoutTemplatePath) {
      const htmlUrls = extractHTMLUrls(options.layoutTemplate);

      for (const urlRef of htmlUrls) {
        const absolutePath = resolveAssetPath(urlRef, options.layoutTemplatePath);

        // Check if asset exists
        const stat = yield* Effect.tryPromise({
          try: () => fs.stat(absolutePath),
          catch: () => new AssetNotFoundError(absolutePath, 'layoutTemplate'),
        });

        const extension = path.extname(absolutePath);
        const mimeType = getMimeType(extension);
        const shouldInline = shouldInlineAsset(extension, stat.size, options.inlineThreshold);

        if (assets.has(absolutePath)) {
          // Add source to existing entry
          const existing = assets.get(absolutePath)!;
          existing.sources.push({
            file: 'layoutTemplate',
            type: 'html-url',
          });
        } else {
          const source: AssetSource = {
            file: 'layoutTemplate',
            type: 'html-url',
          };

          let dataUri: string | undefined;
          if (shouldInline) {
            dataUri = yield* Effect.tryPromise({
              try: () => createDataUri(absolutePath, mimeType),
              catch: () =>
                new CSSProcessError(`Failed to read asset: ${absolutePath}`, 'layoutTemplate'),
            });
          }

          const entry: AssetEntry = {
            originalRef: urlRef,
            sourcePath: absolutePath,
            outputPath: generateUniqueOutputPath(absolutePath, pathTracker),
            size: stat.size,
            inline: shouldInline,
            dataUri,
            mimeType,
            sources: [source],
          };

          assets.set(absolutePath, entry);
        }
      }
    }

    // Log any collision warnings
    logCollisionWarnings(pathTracker);

    const manifest: AssetManifest = {
      assets,
      combinedCSS: '', // Will be filled by css-processor
      cssSourceFiles: cssFiles,
    };

    return manifest;
  });
}
