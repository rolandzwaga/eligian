# Data Model: Standalone Bundle Compilation

**Feature**: 040-standalone-bundle
**Date**: 2025-01-25

## Overview

This document defines the core data types and structures for the standalone bundle compilation feature.

## Public API Types

### BundleOptions

Configuration options for bundle creation.

```typescript
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
  outputDir: '',  // Computed from input path
  minify: false,
  inlineThreshold: 51200,  // 50KB
  sourcemap: false,
  force: false,
};
```

### BundleResult

Result returned from successful bundle creation.

```typescript
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
}
```

### BundleError

Error types for bundle creation failures.

```typescript
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
 * Source location for error reporting
 */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
```

## Internal Types

### AssetManifest

Internal structure for tracking assets during bundling.

```typescript
/**
 * Manifest of all assets to be included in the bundle
 */
export interface AssetManifest {
  /**
   * Map of original path -> asset entry
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
 * Source of an asset reference
 */
export interface AssetSource {
  /**
   * File that references this asset
   */
  file: string;

  /**
   * Type of reference
   */
  type: 'css-url' | 'html-src' | 'config';

  /**
   * Line number in source file (if known)
   */
  line?: number;
}
```

### RuntimeBundleConfig

Configuration for building the Eligius runtime bundle.

```typescript
/**
 * Configuration for runtime bundler
 */
export interface RuntimeBundleConfig {
  /**
   * Path to the generated entry point
   */
  entryPoint: string;

  /**
   * Output path for the bundle
   */
  outputPath: string;

  /**
   * The compiled Eligius configuration (JSON)
   */
  eligiusConfig: object;

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
}

/**
 * Timeline provider types that may require additional bundling
 */
export type TimelineProviderType =
  | 'video'           // Requires video.js
  | 'animationFrame'  // Built-in
  | 'audio'           // Built-in
  | 'lottie';         // Requires lottie-web
```

### HTMLGeneratorConfig

Configuration for HTML file generation.

```typescript
/**
 * Configuration for HTML generator
 */
export interface HTMLGeneratorConfig {
  /**
   * Page title (derived from timeline or file name)
   */
  title: string;

  /**
   * Combined CSS content to embed
   */
  css: string;

  /**
   * Layout template HTML (from configuration)
   */
  layoutTemplate: string;

  /**
   * Container selector from configuration
   */
  containerSelector: string;

  /**
   * Path to JavaScript bundle (relative to HTML)
   */
  bundlePath: string;
}
```

## MIME Type Constants

```typescript
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
};

/**
 * Extensions that should never be inlined (always copied)
 */
export const NEVER_INLINE_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.mov', '.avi',  // Video
  '.mp3', '.wav', '.m4a', '.aac', '.flac',  // Audio
]);

/**
 * Get MIME type for a file extension
 */
export function getMimeType(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Check if a file should be inlined based on extension
 */
export function canInline(extension: string): boolean {
  return !NEVER_INLINE_EXTENSIONS.has(extension.toLowerCase());
}
```

## State Machine: Bundle Creation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Bundle Creation Flow                           │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐
  │  START   │
  └────┬─────┘
       │
       ▼
  ┌──────────────────┐     ┌─────────────────┐
  │ Validate Options │────►│ OutputExistsErr │
  │ & Check Output   │ err └─────────────────┘
  └────────┬─────────┘
           │ ok
           ▼
  ┌──────────────────┐     ┌─────────────────┐
  │ Compile Eligian  │────►│ CompilationErr  │
  │ to JSON Config   │ err └─────────────────┘
  └────────┬─────────┘
           │ ok
           ▼
  ┌──────────────────┐     ┌─────────────────┐
  │ Collect Assets   │────►│ AssetNotFound   │
  │ from CSS/Config  │ err └─────────────────┘
  └────────┬─────────┘
           │ ok
           ▼
  ┌──────────────────┐
  │ Process CSS:     │
  │ - Rewrite URLs   │
  │ - Inline images  │
  │ - Combine files  │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     ┌─────────────────┐
  │ Bundle Runtime:  │────►│ RuntimeBundleErr│
  │ - Eligius + deps │ err └─────────────────┘
  │ - Embed config   │
  └────────┬─────────┘
           │ ok
           ▼
  ┌──────────────────┐
  │ Generate HTML    │
  │ - Embed CSS      │
  │ - Layout template│
  │ - Init script    │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Write Output:    │
  │ - index.html     │
  │ - bundle.js      │
  │ - assets/*       │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Return Result    │
  │ with stats       │
  └──────────────────┘
```

## File Type Categories

```typescript
/**
 * Determine file type category from extension
 */
export function getFileType(extension: string): BundleFile['type'] {
  const ext = extension.toLowerCase();

  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'].includes(ext)) {
    return 'image';
  }
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
    return 'font';
  }
  if (['.mp4', '.webm', '.ogg', '.mp3', '.wav', '.m4a'].includes(ext)) {
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
```
