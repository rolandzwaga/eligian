# Contract: Bundler Module Index

**Module**: `packages/cli/src/bundler/index.ts`

## Purpose

Main entry point for the bundler module. Orchestrates the bundle creation process and provides the public `createBundle` function.

## Public API

```typescript
import { Effect } from 'effect';

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
): Effect.Effect<BundleResult, BundleError>;

// Re-export types for consumers
export type { BundleOptions, BundleResult, BundleFile, BundleStats } from './types.js';
export {
  BundleError,
  AssetNotFoundError,
  OutputExistsError,
  RuntimeBundleError
} from './types.js';
```

## Behavior

### Bundle Creation Flow

```typescript
export function createBundle(
  inputPath: string,
  options: BundleOptions = {}
): Effect.Effect<BundleResult, BundleError> {
  return Effect.gen(function* (_) {
    const startTime = Date.now();
    const resolvedOptions = { ...defaultBundleOptions, ...options };

    // 1. Resolve output directory
    const outputDir = resolvedOptions.outputDir ||
      inputPath.replace(/\.eligian$/, '.bundle');

    // 2. Check if output exists (unless --force)
    if (!resolvedOptions.force && (yield* _(directoryExists(outputDir)))) {
      return yield* _(Effect.fail(new OutputExistsError(outputDir)));
    }

    // 3. Compile Eligian source to configuration
    const compileResult = yield* _(
      Effect.tryPromise({
        try: () => compileFile(inputPath, { optimize: true }),
        catch: (e) => new BundleError(`Compilation failed: ${e}`)
      })
    );

    const config = compileResult.config;
    const basePath = path.dirname(path.resolve(inputPath));

    // 4. Extract CSS file paths from configuration
    const cssFiles = config.cssFiles ?? [];

    // 5. Collect assets from CSS and configuration
    const manifest = yield* _(
      collectAssets(config, cssFiles, basePath, {
        inlineThreshold: resolvedOptions.inlineThreshold
      })
    );

    // 6. Process CSS (rewrite URLs, inline images)
    const combinedCSS = yield* _(
      processCSS(cssFiles, manifest, basePath)
    );

    // 7. Bundle Eligius runtime with configuration
    const bundleJS = yield* _(
      bundleRuntime({
        eligiusConfig: config,
        usedOperations: extractUsedOperations(config),
        usedProviders: extractUsedProviders(config),
        minify: resolvedOptions.minify,
        sourcemap: resolvedOptions.sourcemap,
        tempDir: yield* _(getTempDir())
      })
    );

    // 8. Generate HTML
    const html = generateHTML({
      title: deriveTitle(config, inputPath),
      css: combinedCSS,
      layoutTemplate: config.layoutTemplate ?? '',
      containerSelector: config.containerSelector,
      bundlePath: 'bundle.js'
    });

    // 9. Create output directory
    yield* _(createDirectory(outputDir));

    // 10. Write all files
    const files: BundleFile[] = [];

    // Write index.html
    yield* _(writeFile(path.join(outputDir, 'index.html'), html));
    files.push({
      path: 'index.html',
      size: Buffer.byteLength(html),
      type: 'html'
    });

    // Write bundle.js
    yield* _(writeFile(path.join(outputDir, 'bundle.js'), bundleJS));
    files.push({
      path: 'bundle.js',
      size: Buffer.byteLength(bundleJS),
      type: 'javascript'
    });

    // Write non-inlined assets
    yield* _(createDirectory(path.join(outputDir, 'assets')));
    for (const [, asset] of manifest.assets) {
      if (!asset.inline) {
        const destPath = path.join(outputDir, asset.outputPath);
        yield* _(copyFile(asset.sourcePath, destPath));
        files.push({
          path: asset.outputPath,
          size: asset.size,
          type: getFileType(path.extname(asset.sourcePath))
        });
      }
    }

    // 11. Calculate stats
    const stats: BundleStats = {
      fileCount: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      imagesInlined: countInlined(manifest, 'image'),
      imagesCopied: countCopied(manifest, 'image'),
      cssFilesCombined: cssFiles.length,
      bundleTime: Date.now() - startTime
    };

    return { outputDir, files, stats };
  });
}
```

### Helper Functions

```typescript
function deriveTitle(config: IEngineConfiguration, inputPath: string): string {
  // Try timeline name first
  if (config.timelines?.[0]?.uri) {
    return config.timelines[0].uri;
  }
  // Fall back to file name
  return path.basename(inputPath, '.eligian');
}

function extractUsedOperations(config: IEngineConfiguration): string[] {
  const ops = new Set<string>();
  // ... walk all operations in config
  return [...ops];
}

function extractUsedProviders(config: IEngineConfiguration): TimelineProviderType[] {
  const providers = new Set<TimelineProviderType>();
  // ... extract from timelineProviderSettings
  return [...providers];
}

function countInlined(manifest: AssetManifest, type: string): number {
  return [...manifest.assets.values()]
    .filter(a => a.inline && getFileType(path.extname(a.sourcePath)) === type)
    .length;
}

function countCopied(manifest: AssetManifest, type: string): number {
  return [...manifest.assets.values()]
    .filter(a => !a.inline && getFileType(path.extname(a.sourcePath)) === type)
    .length;
}
```

## Error Handling

All errors from sub-modules bubble up through the Effect pipeline. The main function catches and wraps compilation errors.

| Error | Source | Handling |
|-------|--------|----------|
| `OutputExistsError` | Bundle index | Check before writing |
| `CompilationError` | compile-file.ts | Wrap in BundleError |
| `AssetNotFoundError` | asset-collector | Bubble up |
| `CSSProcessError` | css-processor | Bubble up |
| `RuntimeBundleError` | runtime-bundler | Bubble up |
| `IOError` | File operations | Wrap in BundleError |

## Example Usage

```typescript
import { Effect } from 'effect';
import { createBundle } from '@eligian/cli/bundler';

// Create bundle with defaults
const result = await Effect.runPromise(
  createBundle('./presentation.eligian')
);

console.log(`Bundle created: ${result.outputDir}`);
console.log(`Files: ${result.stats.fileCount}`);
console.log(`Size: ${(result.stats.totalSize / 1024).toFixed(1)} KB`);
console.log(`Time: ${result.stats.bundleTime}ms`);

// Create bundle with options
const result2 = await Effect.runPromise(
  createBundle('./presentation.eligian', {
    outputDir: './dist/bundle',
    minify: true,
    inlineThreshold: 100 * 1024,  // 100KB
    force: true
  })
);
```

## CLI Integration

The CLI main.ts integrates with the bundler:

```typescript
program
  .option('--bundle', 'create standalone bundle')
  .option('--inline-threshold <bytes>', 'image inlining threshold', '51200')
  .option('--force', 'overwrite existing output')
  .action(async (input, options) => {
    if (options.bundle) {
      const result = await Effect.runPromise(
        createBundle(input, {
          outputDir: options.output,
          minify: options.minify,
          inlineThreshold: parseInt(options.inlineThreshold),
          sourcemap: options.sourcemap,
          force: options.force
        })
      );
      console.log(chalk.green(`✓ Bundle created: ${result.outputDir}`));
    } else {
      // Regular compilation
      await compileFileCLI(input, options);
    }
  });
```

## Dependencies

- `./asset-collector.js` - Asset collection
- `./css-processor.js` - CSS processing
- `./html-generator.js` - HTML generation
- `./runtime-bundler.js` - Runtime bundling
- `./image-inliner.js` - Image inlining
- `./types.js` - Type definitions
- `../compile-file.js` - Eligian compilation

## Test Cases

1. **Minimal presentation** - Single timeline, no assets
2. **Full presentation** - Multiple CSS, images, video
3. **Output exists** - Error without --force
4. **Output exists with --force** - Overwrites successfully
5. **Invalid Eligian** - Reports compilation error
6. **Missing asset** - Reports asset not found
7. **Large presentation** - Performance within 10 seconds
8. **Custom output dir** - Creates at specified location
9. **Minification** - Produces smaller output
10. **Stats accuracy** - All counts and sizes correct
