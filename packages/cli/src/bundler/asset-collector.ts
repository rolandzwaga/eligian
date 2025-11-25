/**
 * Asset Collector Module
 *
 * Collects all assets referenced in CSS files and configuration,
 * building a manifest for the bundler. Resolves relative paths and
 * determines which assets should be inlined vs copied.
 */

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
}

/**
 * URL regex pattern for extracting url() from CSS
 */
const URL_REGEX = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

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
 * Generate a unique output filename for an asset
 *
 * Uses just the filename, assuming deduplication handles collisions
 *
 * @param sourcePath - Absolute path to the source file
 * @returns Output path relative to bundle root (e.g., "assets/hero.png")
 */
function generateOutputPath(sourcePath: string): string {
  const fileName = path.basename(sourcePath);
  return `assets/${fileName}`;
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
 * Collect all assets from CSS files and configuration
 *
 * Walks through CSS files extracting url() references, resolves paths,
 * reads file metadata, and builds an asset manifest with inline decisions.
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

    // Collect assets from CSS files
    for (const cssFilePath of cssFiles) {
      // Read CSS file
      const cssContent = yield* Effect.tryPromise({
        try: () => fs.readFile(cssFilePath, 'utf-8'),
        catch: error =>
          new CSSProcessError(`Failed to read CSS file: ${cssFilePath}: ${error}`, cssFilePath),
      });

      // Extract URLs from CSS
      const urls = extractCSSUrls(cssContent);

      // Process each URL
      for (const urlRef of urls) {
        const absolutePath = resolveAssetPath(urlRef, cssFilePath);

        // Check if asset exists
        const stat = yield* Effect.tryPromise({
          try: () => fs.stat(absolutePath),
          catch: () => new AssetNotFoundError(absolutePath, cssFilePath),
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
          });
        } else {
          // Create new entry
          const source: AssetSource = {
            file: cssFilePath,
            type: 'css-url',
          };

          let dataUri: string | undefined;
          if (shouldInline) {
            dataUri = yield* Effect.tryPromise({
              try: () => createDataUri(absolutePath, mimeType),
              catch: () =>
                new CSSProcessError(`Failed to read asset: ${absolutePath}`, cssFilePath),
            });
          }

          const entry: AssetEntry = {
            originalRef: urlRef,
            sourcePath: absolutePath,
            outputPath: generateOutputPath(absolutePath),
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
          outputPath: generateOutputPath(absolutePath),
          size: stat.size,
          inline: shouldInline,
          mimeType,
          sources: [source],
        };

        assets.set(absolutePath, entry);
      }
    }

    const manifest: AssetManifest = {
      assets,
      combinedCSS: '', // Will be filled by css-processor
      cssSourceFiles: cssFiles,
    };

    return manifest;
  });
}
