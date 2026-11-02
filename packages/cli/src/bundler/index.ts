/**
 * Bundler Module Index
 *
 * Main entry point for the bundler module. Orchestrates the bundle creation
 * process and provides the public `createBundle` function.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { CompileError, compileFile } from '../compile-file.js';
import { deriveDefaultOutputPath, isSamePath } from '../output-path.js';
import { type CollectOptions, collectAssets, rewriteConfigAssetRefs } from './asset-collector.js';
import { processCSS } from './css-processor.js';
import { generateHTML, rewriteHTMLUrls } from './html-generator.js';
import { calculateInlineOverhead } from './inline-overhead.js';
import { bundleRuntime, extractUsedOperations } from './runtime-bundler.js';
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
 * Bundle failure caused by the Eligian compile step.
 *
 * Wraps the original typed {@link CompileError} (ParseError, CompilationError,
 * AssetError, IOError) so callers can still present the line/snippet/hint
 * details instead of a flattened "Compilation failed: ParseError: ..." string.
 */
export class BundleCompileError extends BundleError {
  constructor(public readonly compileError: CompileError) {
    super(`Compilation failed: ${compileError.message}`);
    this.name = 'BundleCompileError';
  }
}

/**
 * Entries of the output directory that the bundler creates and therefore may
 * delete when rebuilding with --force.
 */
const BUNDLE_OWNED_ENTRIES = ['index.html', 'bundle.js', 'bundle.js.map', 'assets'];

/** True when `child` is `parent` or lies inside it (case-insensitive on Windows via path.relative). */
function isInsideOrSame(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Why removing the bundler-owned entries of `outputDir` (the `--force` cleanup) would
 * delete project files, or `undefined` when it is safe.
 *
 * Unsafe when `outputDir` is the source directory or one of its parents (e.g. `-o .`,
 * where `assets/` and `index.html` are the user's own files), or when any file the
 * bundle is about to read lies inside one of the owned entries.
 */
export function unsafeForceCleanupReason(
  outputDir: string,
  basePath: string,
  sourcePaths: readonly string[]
): string | undefined {
  if (isInsideOrSame(basePath, outputDir)) {
    return `the output directory ${outputDir} contains the source directory ${basePath}`;
  }
  for (const owned of BUNDLE_OWNED_ENTRIES) {
    const ownedPath = path.join(path.resolve(outputDir), owned);
    const source = sourcePaths.find(sourcePath => isInsideOrSame(sourcePath, ownedPath));
    if (source) {
      return `source file ${source} lies inside ${ownedPath}`;
    }
  }
  return undefined;
}

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

/** Directory of this module: inside the installed CLI package (dist/ or src/bundler/). */
const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));

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
 * Describe an unknown thrown value for inclusion in an error message
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Derive page title from configuration or input file
 *
 * An animation timeline's uri is its name, which makes a good title. A media
 * timeline's uri is the media file path (an identifier, not a title), so it
 * falls back to the input file name like every other case.
 */
export function deriveTitle(config: IEngineConfiguration, inputPath: string): string {
  const first = config.timelines?.[0];
  if (first?.uri && first.type !== 'mediaplayer') {
    return first.uri;
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
    const outputDir = resolvedOptions.outputDir || deriveDefaultOutputPath(inputPath, '.bundle');

    // Never write the bundle over the source file
    if (isSamePath(inputPath, outputDir)) {
      return yield* Effect.fail(
        new BundleError(`Output directory must not be the input file: ${inputPath}`)
      );
    }

    // Check if output exists (unless --force)
    if (!resolvedOptions.force && (yield* Effect.promise(() => directoryExists(outputDir)))) {
      return yield* Effect.fail(new OutputExistsError(outputDir));
    }

    // Compile Eligian source to configuration
    const compileResult = yield* Effect.tryPromise({
      try: () => compileFile(inputPath, { optimize: resolvedOptions.optimize }),
      catch: e =>
        e instanceof CompileError
          ? new BundleCompileError(e)
          : new BundleError(`Compilation failed: ${e instanceof Error ? e.message : String(e)}`),
    });

    const config = compileResult.config;

    // Extract CSS file paths from configuration
    const cssFilePaths = config.cssFiles ?? [];
    const basePath = path.dirname(path.resolve(inputPath));

    // Resolve CSS file paths to absolute paths
    const absoluteCssPaths = cssFilePaths.map(cssFile => path.resolve(basePath, cssFile));

    // Get layout template for asset collection
    const layoutTemplate = config.layoutTemplate ?? '';

    // Create a virtual path for the layout template (used for resolving relative URLs)
    // We use a path relative to the basePath since that's where the .eligian file is
    const layoutTemplatePath = path.join(basePath, 'layout.html');

    // Collect all assets from CSS files, configuration, and layout template
    const collectOptions: CollectOptions = {
      inlineThreshold: resolvedOptions.inlineThreshold,
      layoutTemplate: layoutTemplate || undefined,
      layoutTemplatePath: layoutTemplate ? layoutTemplatePath : undefined,
    };

    const manifest = yield* collectAssets(config, absoluteCssPaths, basePath, collectOptions).pipe(
      Effect.mapError(e => new BundleError(`Asset collection failed: ${e.message}`))
    );

    // Process CSS with URL rewriting (and optional minification)
    const combinedCSS = yield* processCSS(absoluteCssPaths, manifest, basePath, {
      minify: resolvedOptions.minify,
    }).pipe(Effect.mapError(e => new BundleError(`CSS processing failed: ${e.message}`)));

    // Point media references in the embedded config at the copied bundle files
    const bundleConfig = rewriteConfigAssetRefs(config, manifest, basePath);

    // Bundle Eligius runtime with configuration. The temp directory is released
    // on every outcome (success, esbuild failure, interruption) so a failed run
    // never leaves eligian-bundle-* directories (and the entry file) behind.
    const bundleJS = yield* Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => fs.mkdtemp(path.join(os.tmpdir(), 'eligian-bundle-')),
        catch: e => new BundleError(`Failed to create temp directory: ${describeError(e)}`),
      }),
      tempDir =>
        Effect.gen(function* () {
          // Find node_modules paths for esbuild to resolve 'eligius' and 'jquery':
          // the project's own first (its versions win), then the CLI's, which
          // declares both as dependencies, so a project without them still bundles
          const nodePaths = yield* Effect.tryPromise({
            try: async () => {
              const projectPaths = await findNodeModulesPaths(basePath);
              const cliPaths = await findNodeModulesPaths(CLI_DIR);
              return [...new Set([...projectPaths, ...cliPaths])];
            },
            catch: e => new BundleError(`Failed to find node_modules paths: ${describeError(e)}`),
          });

          return yield* bundleRuntime({
            eligiusConfig: bundleConfig,
            usedOperations: extractUsedOperations(bundleConfig),
            host: compileResult.host,
            minify: resolvedOptions.minify,
            sourcemap: resolvedOptions.sourcemap,
            tempDir,
            nodePaths,
          }).pipe(Effect.mapError(e => new BundleError(`Runtime bundling failed: ${e.message}`)));
        }),
      // Cleanup failure is non-fatal: warn but don't abort the bundle
      tempDir =>
        Effect.promise(() =>
          fs
            .rm(tempDir, { recursive: true, force: true })
            .catch(e => console.warn(`⚠ Cleanup failed: ${describeError(e)}`))
        )
    );

    // Generate HTML with rewritten layout template URLs
    const containerSelector = config.containerSelector || '#app';

    // Rewrite asset URLs in the layout template to use bundled paths or data URIs
    const rewrittenLayoutTemplate = layoutTemplate
      ? rewriteHTMLUrls(layoutTemplate, layoutTemplatePath, manifest)
      : '';

    const html = generateHTML({
      title: deriveTitle(config, inputPath),
      css: combinedCSS,
      layoutTemplate: rewrittenLayoutTemplate,
      containerSelector,
      bundlePath: 'bundle.js',
    });

    // Under --force the directory may hold an earlier bundle: remove only what the
    // bundler owns so dropped or renamed assets are not shipped again. Everything
    // else in the directory is left alone (the user may have pointed --output at
    // a directory with other content). All of this happens after the build has
    // succeeded, so a failed rebuild never destroys the previous bundle.
    // The cleanup is skipped when it would delete project sources (`-o .`, or an
    // asset/CSS file that lives in `<outputDir>/assets`): files are then only overwritten.
    const unsafeCleanup = resolvedOptions.force
      ? unsafeForceCleanupReason(outputDir, basePath, [
          path.resolve(inputPath),
          ...absoluteCssPaths,
          ...[...manifest.assets.values()].map(asset => asset.sourcePath),
        ])
      : undefined;
    if (unsafeCleanup) {
      yield* Effect.sync(() =>
        console.warn(
          `⚠ Not removing the previous bundle in ${outputDir}: ${unsafeCleanup}. Existing files are overwritten instead.`
        )
      );
    }
    if (resolvedOptions.force && !unsafeCleanup) {
      yield* Effect.tryPromise({
        try: async () => {
          for (const owned of BUNDLE_OWNED_ENTRIES) {
            await fs.rm(path.join(outputDir, owned), { recursive: true, force: true });
          }
        },
        catch: e =>
          new BundleError(`Failed to clean previous bundle in ${outputDir}: ${describeError(e)}`),
      });
    }

    // Create output directory
    yield* Effect.tryPromise({
      try: () => fs.mkdir(outputDir, { recursive: true }),
      catch: e =>
        new BundleError(`Failed to create output directory: ${outputDir}: ${describeError(e)}`),
    });

    // Write files
    const files: BundleFile[] = [];

    // Write index.html
    yield* Effect.tryPromise({
      try: () => fs.writeFile(path.join(outputDir, 'index.html'), html, 'utf-8'),
      catch: e => new BundleError(`Failed to write index.html: ${describeError(e)}`),
    });
    files.push({
      path: 'index.html',
      size: Buffer.byteLength(html, 'utf-8'),
      type: 'html',
    });

    // Write bundle.js
    yield* Effect.tryPromise({
      try: () => fs.writeFile(path.join(outputDir, 'bundle.js'), bundleJS, 'utf-8'),
      catch: e => new BundleError(`Failed to write bundle.js: ${describeError(e)}`),
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
        catch: e => new BundleError(`Failed to create assets directory: ${describeError(e)}`),
      });

      // Copy each non-inlined asset
      for (const asset of nonInlinedAssets) {
        const destPath = path.join(outputDir, asset.outputPath);
        yield* Effect.tryPromise({
          try: () => fs.copyFile(asset.sourcePath, destPath),
          catch: e =>
            new BundleError(`Failed to copy asset: ${asset.sourcePath}: ${describeError(e)}`),
        });

        const ext = path.extname(asset.sourcePath);
        const fileType = getFileType(ext);
        files.push({
          path: asset.outputPath,
          size: asset.size,
          type: fileType,
        });

        if (fileType === 'image') {
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

    // Calculate inline overhead (IMP5)
    const overheadResult = calculateInlineOverhead(manifest.assets);

    // Calculate stats
    const stats: BundleStats = {
      fileCount: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      imagesInlined,
      imagesCopied,
      cssFilesCombined: absoluteCssPaths.length,
      bundleTime: Date.now() - startTime,
      inlinedOriginalSize: overheadResult.inlinedOriginalSize,
      inlinedEncodedSize: overheadResult.inlinedEncodedSize,
      inlineOverheadPercent: overheadResult.inlineOverheadPercent,
    };

    return { outputDir, files, stats };
  });
}
