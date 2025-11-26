/**
 * Standalone Bundle Compilation Types
 *
 * Types and error classes for creating self-contained Eligius presentation bundles.
 */

import type { IEngineConfiguration } from 'eligius';

/**
 * Options for creating a standalone bundle
 */
export interface BundleOptions {
  /**
   * Output directory path for the bundle
   * @default "<inputFile>.bundle" (same directory as input)
   */
  outputDir?: string;

  /**
   * Whether to minify JavaScript and CSS output
   * @default false
   */
  minify?: boolean;

  /**
   * Image size threshold in bytes for inlining as base64 data URIs
   * Images smaller than this will be inlined, larger ones copied to assets/
   * Set to 0 to disable inlining entirely
   * @default 51200 (50KB)
   */
  inlineThreshold?: number;

  /**
   * Generate source maps for debugging
   * @default false
   */
  sourcemap?: boolean;

  /**
   * Force overwrite existing output directory
   * @default false
   */
  force?: boolean;
}

/**
 * Default bundle options
 */
export const defaultBundleOptions: Required<BundleOptions> = {
  outputDir: '', // Computed from input path
  minify: false,
  inlineThreshold: 51200, // 50KB
  sourcemap: false,
  force: false,
};

/**
 * Information about a generated file
 */
export interface BundleFile {
  /**
   * Relative path from output directory
   */
  path: string;

  /**
   * File size in bytes
   */
  size: number;

  /**
   * File type category
   */
  type: 'html' | 'javascript' | 'css' | 'image' | 'font' | 'media' | 'other';
}

/**
 * Bundle statistics
 */
export interface BundleStats {
  /**
   * Total number of files in the bundle
   */
  fileCount: number;

  /**
   * Total bundle size in bytes
   */
  totalSize: number;

  /**
   * Number of images inlined as base64
   */
  imagesInlined: number;

  /**
   * Number of images copied to assets
   */
  imagesCopied: number;

  /**
   * Number of CSS files combined
   */
  cssFilesCombined: number;

  /**
   * Bundle creation time in milliseconds
   */
  bundleTime: number;

  /**
   * Total original size of inlined assets in bytes (IMP5)
   */
  inlinedOriginalSize: number;

  /**
   * Total encoded size of inlined assets (data URI length) (IMP5)
   */
  inlinedEncodedSize: number;

  /**
   * Percentage overhead from base64 encoding (IMP5)
   * Formula: ((encodedSize - originalSize) / originalSize) * 100
   * Typical base64 overhead is ~37% (33% from encoding + data URI prefix)
   */
  inlineOverheadPercent: number;
}

/**
 * Result of bundle creation
 */
export interface BundleResult {
  /**
   * Absolute path to the output directory
   */
  outputDir: string;

  /**
   * List of files generated
   */
  files: BundleFile[];

  /**
   * Asset statistics
   */
  stats: BundleStats;
}

/**
 * Source location for error reporting
 */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/**
 * Base class for bundle errors
 */
export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}

/**
 * Asset not found during bundling
 */
export class AssetNotFoundError extends BundleError {
  constructor(
    public readonly assetPath: string,
    public readonly sourceFile: string,
    public readonly sourceLocation?: SourceLocation
  ) {
    super(`Asset not found: ${assetPath}`);
    this.name = 'AssetNotFoundError';
  }
}

/**
 * Output directory already exists
 */
export class OutputExistsError extends BundleError {
  constructor(public readonly outputDir: string) {
    super(`Output directory already exists: ${outputDir}. Use --force to overwrite.`);
    this.name = 'OutputExistsError';
  }
}

/**
 * esbuild bundle failure
 */
export class RuntimeBundleError extends BundleError {
  constructor(
    message: string,
    public readonly esbuildErrors?: string[]
  ) {
    super(message);
    this.name = 'RuntimeBundleError';
  }
}

/**
 * CSS processing error
 */
export class CSSProcessError extends BundleError {
  constructor(
    message: string,
    public readonly cssFile?: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(message);
    this.name = 'CSSProcessError';
  }
}

/**
 * Image inlining error
 */
export class ImageInlineError extends BundleError {
  constructor(
    message: string,
    public readonly imagePath: string
  ) {
    super(message);
    this.name = 'ImageInlineError';
  }
}

// =============================================================================
// MIME Types and Helper Functions
// =============================================================================

/**
 * MIME types for common asset extensions
 */
export const MIME_TYPES: Record<string, string> = {
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',

  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',

  // Media (never inlined)
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

/**
 * Extensions that should never be inlined (always copied)
 * These are media files that are too large or not suitable for base64 encoding
 */
export const NEVER_INLINE_EXTENSIONS = new Set([
  // Video
  '.mp4',
  '.webm',
  '.ogg',
  '.mov',
  '.avi',
  '.mkv',
  // Audio
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
]);

/**
 * Get MIME type for a file extension
 *
 * @param extension - File extension including dot (e.g., '.png')
 * @returns MIME type string, or 'application/octet-stream' for unknown types
 */
export function getMimeType(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Check if a file can be inlined based on its extension
 * Media files (video/audio) should never be inlined regardless of size
 *
 * @param extension - File extension including dot (e.g., '.mp4')
 * @returns true if the file type can potentially be inlined
 */
export function canInline(extension: string): boolean {
  return !NEVER_INLINE_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * Determine file type category from extension
 *
 * @param extension - File extension including dot (e.g., '.png')
 * @returns File type category
 */
export function getFileType(extension: string): BundleFile['type'] {
  const ext = extension.toLowerCase();

  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'].includes(ext)) {
    return 'image';
  }
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
    return 'font';
  }
  if (
    [
      '.mp4',
      '.webm',
      '.ogg',
      '.mp3',
      '.wav',
      '.m4a',
      '.aac',
      '.flac',
      '.mov',
      '.avi',
      '.mkv',
    ].includes(ext)
  ) {
    return 'media';
  }
  if (ext === '.js' || ext === '.mjs') {
    return 'javascript';
  }
  if (ext === '.css') {
    return 'css';
  }
  if (ext === '.html' || ext === '.htm') {
    return 'html';
  }
  return 'other';
}

// =============================================================================
// Internal Types (Asset Manifest)
// =============================================================================

/**
 * Source of an asset reference
 */
export interface AssetSource {
  /**
   * File that references this asset
   */
  file: string;

  /**
   * Type of reference
   * - 'css-url': url() reference in CSS file
   * - 'html-src': src attribute in HTML element
   * - 'html-url': URL in layout template HTML (img src, video poster, srcset)
   * - 'config': Reference in Eligius configuration (video/audio source)
   */
  type: 'css-url' | 'html-src' | 'html-url' | 'config';

  /**
   * Line number in source file (if known)
   */
  line?: number;
}

/**
 * Entry for a single asset
 */
export interface AssetEntry {
  /**
   * Original reference as it appears in source (CSS url(), config, etc.)
   */
  originalRef: string;

  /**
   * Absolute path to the source file
   */
  sourcePath: string;

  /**
   * Relative path in the output bundle (e.g., "assets/images/hero.png")
   */
  outputPath: string;

  /**
   * File size in bytes
   */
  size: number;

  /**
   * Whether this asset should be inlined as data URI
   */
  inline: boolean;

  /**
   * Base64 data URI (only if inline=true)
   */
  dataUri?: string;

  /**
   * MIME type of the asset
   */
  mimeType: string;

  /**
   * Where this asset was referenced from
   */
  sources: AssetSource[];
}

/**
 * Manifest of all assets to be included in the bundle
 */
export interface AssetManifest {
  /**
   * Map of absolute source path -> asset entry
   */
  assets: Map<string, AssetEntry>;

  /**
   * Combined CSS content with rewritten URLs
   */
  combinedCSS: string;

  /**
   * CSS files that were combined (in order)
   */
  cssSourceFiles: string[];
}

/**
 * Configuration for HTML generation
 */
export interface HTMLGeneratorConfig {
  /**
   * Page title
   */
  title: string;

  /**
   * Combined CSS content to embed in <style> tag
   */
  css: string;

  /**
   * Layout template HTML content
   * Inserted inside the container element
   */
  layoutTemplate: string;

  /**
   * Container selector from Eligius config
   * Used to create container element with matching ID/class
   * @example "#eligius-container" -> <div id="eligius-container">
   */
  containerSelector: string;

  /**
   * Path to JavaScript bundle (relative to HTML file)
   * @default "bundle.js"
   */
  bundlePath?: string;
}

/**
 * Timeline provider types that may require additional bundling
 */
export type TimelineProviderType =
  | 'video' // Requires video.js
  | 'animationFrame' // Built-in
  | 'audio' // Built-in
  | 'lottie'; // Requires lottie-web

/**
 * Configuration for runtime bundler
 */
export interface RuntimeBundleConfig {
  /**
   * The compiled Eligius configuration
   */
  eligiusConfig: IEngineConfiguration;

  /**
   * Operations used in the configuration (for tree-shaking)
   */
  usedOperations: string[];

  /**
   * Timeline provider types used
   */
  usedProviders: TimelineProviderType[];

  /**
   * Whether to minify output
   */
  minify: boolean;

  /**
   * Whether to generate source maps
   */
  sourcemap: boolean;

  /**
   * Temporary directory for generated files
   */
  tempDir: string;

  /**
   * Additional paths for esbuild to search for node_modules
   * Used to resolve packages like 'eligius' and 'jquery'
   * @default []
   */
  nodePaths?: string[];
}

/**
 * Result of inline decision check
 */
export interface InlineDecision {
  /**
   * Whether the file should be inlined
   */
  shouldInline: boolean;

  /**
   * File size in bytes
   */
  size: number;

  /**
   * MIME type of the file
   */
  mimeType: string;

  /**
   * Reason for decision
   */
  reason: 'under-threshold' | 'over-threshold' | 'never-inline-type';
}
