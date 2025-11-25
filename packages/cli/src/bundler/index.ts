/**
 * Bundler Module Index
 *
 * Main entry point for the bundler module. Orchestrates the bundle creation
 * process and provides the public `createBundle` function.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { compileFile } from '../compile-file.js';
import { type CollectOptions, collectAssets } from './asset-collector.js';
import { processCSS } from './css-processor.js';
import { generateHTML } from './html-generator.js';
import { bundleRuntime, extractUsedOperations, extractUsedProviders } from './runtime-bundler.js';
import {
  BundleError,
  type BundleFile,
  type BundleOptions,
  type BundleResult,
  type BundleStats,
  defaultBundleOptions,
  getFileType,
  OutputExistsError,
} from './types.js';

// Re-export types for consumers
export type { BundleFile, BundleOptions, BundleResult, BundleStats } from './types.js';
export { AssetNotFoundError, BundleError, OutputExistsError, RuntimeBundleError } from './types.js';

/**
 * Check if a directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find node_modules directories by walking up from a starting directory
 * Returns array of paths to search (for esbuild nodePaths)
 */
async function findNodeModulesPaths(startDir: string): Promise<string[]> {
  const paths: string[] = [];
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const nodeModulesPath = path.join(currentDir, 'node_modules');
    if (await directoryExists(nodeModulesPath)) {
      paths.push(nodeModulesPath);
    }
    currentDir = path.dirname(currentDir);
  }

  return paths;
}

/**
 * Derive page title from configuration or input file
 */
function deriveTitle(config: IEngineConfiguration, inputPath: string): string {
  // Try timeline uri first
  const timelines = config.timelines;
  if (timelines?.[0]?.uri) {
    return timelines[0].uri;
  }
  // Fall back to file name without extension
  return path.basename(inputPath, '.eligian');
}

/**
 * Create a standalone bundle from an Eligian source file
 *
 * This is the main entry point for bundle creation. It:
 * 1. Compiles the Eligian source to configuration
 * 2. Collects all assets from CSS and configuration
 * 3. Processes CSS with URL rewriting and optional inlining
 * 4. Bundles the Eligius runtime with embedded configuration
 * 5. Generates the HTML entry point
 * 6. Writes all files to the output directory
 *
 * @param inputPath - Path to the .eligian source file
 * @param options - Bundle options
 * @returns Effect that resolves to BundleResult
 */
export function createBundle(
  inputPath: string,
  options?: BundleOptions
): Effect.Effect<BundleResult, BundleError> {
  return Effect.gen(function* () {
    const startTime = Date.now();
    const resolvedOptions = { ...defaultBundleOptions, ...options };

    // Resolve output directory
    const outputDir = resolvedOptions.outputDir || inputPath.replace(/\.eligian$/, '.bundle');

    // Check if output exists (unless --force)
    if (!resolvedOptions.force && (yield* Effect.promise(() => directoryExists(outputDir)))) {
      return yield* Effect.fail(new OutputExistsError(outputDir));
    }

    // Compile Eligian source to configuration
    let compileResult: Awaited<ReturnType<typeof compileFile>>;
    try {
      compileResult = yield* Effect.tryPromise({
        try: () => compileFile(inputPath, { optimize: true }),
        catch: e => new BundleError(`Compilation failed: ${e}`),
      });
    } catch (error) {
      return yield* Effect.fail(new BundleError(`Compilation failed: ${error}`));
    }

    const config = compileResult.config;

    // Extract CSS file paths from configuration
    const cssFilePaths = config.cssFiles ?? [];
    const basePath = path.dirname(path.resolve(inputPath));

    // Resolve CSS file paths to absolute paths
    const absoluteCssPaths = cssFilePaths.map(cssFile => path.resolve(basePath, cssFile));

    // Collect all assets from CSS files and configuration
    const collectOptions: CollectOptions = {
      inlineThreshold: resolvedOptions.inlineThreshold,
    };

    const manifest = yield* collectAssets(config, absoluteCssPaths, basePath, collectOptions).pipe(
      Effect.mapError(e => new BundleError(`Asset collection failed: ${e.message}`))
    );

    // Process CSS with URL rewriting
    const combinedCSS = yield* processCSS(absoluteCssPaths, manifest, basePath).pipe(
      Effect.mapError(e => new BundleError(`CSS processing failed: ${e.message}`))
    );

    // Create temp directory for bundling
    const tempDir = yield* Effect.tryPromise({
      try: () => fs.mkdtemp(path.join(os.tmpdir(), 'eligian-bundle-')),
      catch: () => new BundleError('Failed to create temp directory'),
    });

    // Find node_modules paths for esbuild to resolve 'eligius' and 'jquery'
    const nodePaths = yield* Effect.tryPromise({
      try: () => findNodeModulesPaths(basePath),
      catch: () => new BundleError('Failed to find node_modules paths'),
    });

    // Bundle Eligius runtime with configuration
    const usedOperations = extractUsedOperations(config);
    const usedProviders = extractUsedProviders(config);

    const bundleJS = yield* bundleRuntime({
      eligiusConfig: config,
      usedOperations,
      usedProviders,
      minify: resolvedOptions.minify,
      sourcemap: resolvedOptions.sourcemap,
      tempDir,
      nodePaths,
    }).pipe(Effect.mapError(e => new BundleError(`Runtime bundling failed: ${e.message}`)));

    // Clean up temp directory
    yield* Effect.tryPromise({
      try: () => fs.rm(tempDir, { recursive: true, force: true }),
      catch: () => new BundleError('Failed to clean up temp directory'),
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

    // Generate HTML
    const containerSelector = config.containerSelector || '#app';
    const layoutTemplate = config.layoutTemplate ?? '';

    const html = generateHTML({
      title: deriveTitle(config, inputPath),
      css: combinedCSS,
      layoutTemplate,
      containerSelector,
      bundlePath: 'bundle.js',
    });

    // Create output directory
    yield* Effect.tryPromise({
      try: () => fs.mkdir(outputDir, { recursive: true }),
      catch: () => new BundleError(`Failed to create output directory: ${outputDir}`),
    });

    // Write files
    const files: BundleFile[] = [];

    // Write index.html
    yield* Effect.tryPromise({
      try: () => fs.writeFile(path.join(outputDir, 'index.html'), html, 'utf-8'),
      catch: () => new BundleError('Failed to write index.html'),
    });
    files.push({
      path: 'index.html',
      size: Buffer.byteLength(html, 'utf-8'),
      type: 'html',
    });

    // Write bundle.js
    yield* Effect.tryPromise({
      try: () => fs.writeFile(path.join(outputDir, 'bundle.js'), bundleJS, 'utf-8'),
      catch: () => new BundleError('Failed to write bundle.js'),
    });
    files.push({
      path: 'bundle.js',
      size: Buffer.byteLength(bundleJS, 'utf-8'),
      type: 'javascript',
    });

    // Copy non-inlined assets to assets/ directory
    let imagesInlined = 0;
    let imagesCopied = 0;

    const nonInlinedAssets = [...manifest.assets.values()].filter(asset => !asset.inline);

    if (nonInlinedAssets.length > 0) {
      // Create assets directory
      const assetsDir = path.join(outputDir, 'assets');
      yield* Effect.tryPromise({
        try: () => fs.mkdir(assetsDir, { recursive: true }),
        catch: () => new BundleError('Failed to create assets directory'),
      });

      // Copy each non-inlined asset
      for (const asset of nonInlinedAssets) {
        const destPath = path.join(outputDir, asset.outputPath);
        yield* Effect.tryPromise({
          try: () => fs.copyFile(asset.sourcePath, destPath),
          catch: () => new BundleError(`Failed to copy asset: ${asset.sourcePath}`),
        });

        const ext = path.extname(asset.sourcePath);
        files.push({
          path: asset.outputPath,
          size: asset.size,
          type: getFileType(ext),
        });

        if (getFileType(ext) === 'image') {
          imagesCopied++;
        }
      }
    }

    // Count inlined images
    for (const asset of manifest.assets.values()) {
      if (asset.inline) {
        const ext = path.extname(asset.sourcePath);
        if (getFileType(ext) === 'image') {
          imagesInlined++;
        }
      }
    }

    // Calculate stats
    const stats: BundleStats = {
      fileCount: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      imagesInlined,
      imagesCopied,
      cssFilesCombined: absoluteCssPaths.length,
      bundleTime: Date.now() - startTime,
    };

    return { outputDir, files, stats };
  });
}
