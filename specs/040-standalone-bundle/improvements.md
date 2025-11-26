# Feature 040 Improvements Plan

**Date**: 2025-01-26
**Branch**: `040-standalone-bundle`
**Status**: Post-implementation improvements

## Overview

This document outlines 5 improvements identified during deep analysis of the spec 040 implementation. These address gaps between the specification and implementation, plus enhancements for robustness.

---

## Improvement 1: CSS Minification Support [HIGH PRIORITY]

### Problem

**FR-015** states: "System MUST support the `--minify` flag to minify JavaScript **and CSS** output."

Currently, only JavaScript is minified via esbuild. CSS is embedded in the HTML without minification.

### Solution

Use esbuild's `transform` API to minify CSS before embedding in HTML. esbuild 0.27.0 supports CSS minification via `loader: 'css'` with `minify: true`.

### Implementation

**File**: `packages/cli/src/bundler/css-processor.ts`

1. Add new function `minifyCSS()`:

```typescript
import * as esbuild from 'esbuild';

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
```

2. Update `processCSS()` signature to accept `minify` option:

```typescript
export function processCSS(
  cssFiles: string[],
  manifest: AssetManifest,
  basePath: string,
  options?: { minify?: boolean }
): Effect.Effect<string, CSSProcessError>
```

3. At the end of `processCSS()`, conditionally minify:

```typescript
let result = parts.join('\n').trim();
if (options?.minify) {
  result = yield* Effect.tryPromise({
    try: () => minifyCSS(result),
    catch: (error) => new CSSProcessError(`CSS minification failed: ${error}`),
  });
}
return result;
```

**File**: `packages/cli/src/bundler/index.ts`

4. Update `processCSS()` call to pass minify option:

```typescript
const combinedCSS = yield* processCSS(absoluteCssPaths, manifest, basePath, {
  minify: resolvedOptions.minify,
}).pipe(...)
```

### Tests

**File**: `packages/cli/src/__tests__/bundler/css-processor.spec.ts`

Add tests:
- `minifyCSS()` removes whitespace and comments
- `minifyCSS()` preserves functional CSS
- `processCSS()` with `minify: true` produces smaller output
- `processCSS()` with `minify: false` preserves formatting

### Tasks

| ID | Task | Est. |
|----|------|------|
| IMP1-T1 | Add `minifyCSS()` function to css-processor.ts | 15min |
| IMP1-T2 | Update `processCSS()` to accept minify option | 10min |
| IMP1-T3 | Update `index.ts` to pass minify option | 5min |
| IMP1-T4 | Write unit tests for CSS minification | 20min |
| IMP1-T5 | Run full test suite and verify | 5min |

**Total**: ~55 minutes

---

## Improvement 2: HTML Layout Template Image Parsing [MEDIUM PRIORITY]

### Problem

**User Story 2, Acceptance Scenario 2** states: "Given a .eligian file with a layout template containing image tags, When bundled, Then the images are copied to the assets folder and **HTML src attributes are updated**."

Currently, asset collector only extracts URLs from:
- CSS `url()` references
- Config `timelineProviderSettings` (src/path)

It does NOT parse `layoutTemplate` HTML for `<img src="...">`, `<source src="...">`, etc.

### Solution

Add HTML parsing to extract asset references from `layoutTemplate` in the configuration.

### Implementation

**File**: `packages/cli/src/bundler/asset-collector.ts`

1. Add HTML URL extraction function:

```typescript
/**
 * Regex patterns for HTML asset references
 */
const HTML_SRC_REGEX = /<(?:img|source|video|audio)\s+[^>]*src=["']([^"']+)["']/gi;
const HTML_SRCSET_REGEX = /srcset=["']([^"']+)["']/gi;
const HTML_POSTER_REGEX = /poster=["']([^"']+)["']/gi;

/**
 * Extract asset URLs from HTML content
 *
 * @param html - HTML content string
 * @returns Array of unique URL references
 */
export function extractHTMLUrls(html: string): string[] {
  const urls = new Set<string>();

  // Extract src attributes
  let match: RegExpExecArray | null;
  HTML_SRC_REGEX.lastIndex = 0;
  while ((match = HTML_SRC_REGEX.exec(html)) !== null) {
    const url = match[1].trim();
    if (!isExternalUrl(url) && !isDataUri(url)) {
      urls.add(url);
    }
  }

  // Extract poster attributes (video thumbnails)
  HTML_POSTER_REGEX.lastIndex = 0;
  while ((match = HTML_POSTER_REGEX.exec(html)) !== null) {
    const url = match[1].trim();
    if (!isExternalUrl(url) && !isDataUri(url)) {
      urls.add(url);
    }
  }

  // Extract srcset (responsive images) - each entry separated by comma
  HTML_SRCSET_REGEX.lastIndex = 0;
  while ((match = HTML_SRCSET_REGEX.exec(html)) !== null) {
    const srcset = match[1];
    for (const entry of srcset.split(',')) {
      const url = entry.trim().split(/\s+/)[0]; // First part is URL
      if (url && !isExternalUrl(url) && !isDataUri(url)) {
        urls.add(url);
      }
    }
  }

  return [...urls];
}
```

2. Add function to extract HTML assets from config:

```typescript
/**
 * Extract asset paths from layout template HTML
 */
function extractLayoutTemplateAssets(
  config: IEngineConfiguration,
  basePath: string
): Array<{ absolutePath: string; originalRef: string; sourceType: 'html-src' }> {
  const assets: Array<{ absolutePath: string; originalRef: string; sourceType: 'html-src' }> = [];

  const layoutTemplate = config.layoutTemplate;
  if (!layoutTemplate) {
    return assets;
  }

  const urls = extractHTMLUrls(layoutTemplate);

  for (const url of urls) {
    assets.push({
      absolutePath: path.resolve(basePath, url),
      originalRef: url,
      sourceType: 'html-src',
    });
  }

  return assets;
}
```

3. Update `collectAssets()` to include layout template assets:

```typescript
// After collecting config assets, add:
const layoutAssets = extractLayoutTemplateAssets(config, basePath);

for (const { absolutePath, originalRef, sourceType } of layoutAssets) {
  // Same logic as configAssets processing...
}
```

**File**: `packages/cli/src/bundler/html-generator.ts`

4. Add function to rewrite HTML URLs:

```typescript
/**
 * Rewrite asset URLs in HTML content based on manifest
 */
export function rewriteHTMLUrls(
  html: string,
  manifest: AssetManifest,
  basePath: string
): string {
  // Rewrite src attributes
  let result = html.replace(
    /(<(?:img|source|video|audio)\s+[^>]*src=["'])([^"']+)(["'])/gi,
    (match, prefix, url, suffix) => {
      const trimmedUrl = url.trim();
      if (isExternalUrl(trimmedUrl) || isDataUri(trimmedUrl)) {
        return match;
      }
      const absolutePath = path.resolve(basePath, trimmedUrl);
      const asset = manifest.assets.get(absolutePath);
      if (asset) {
        return `${prefix}${asset.inline ? asset.dataUri : asset.outputPath}${suffix}`;
      }
      return match;
    }
  );

  // Similar for poster attribute...

  return result;
}
```

**File**: `packages/cli/src/bundler/index.ts`

5. Update HTML generation to rewrite layout template URLs:

```typescript
const processedLayoutTemplate = rewriteHTMLUrls(layoutTemplate, manifest, basePath);

const html = generateHTML({
  // ...
  layoutTemplate: processedLayoutTemplate,
  // ...
});
```

### Tests

**File**: `packages/cli/src/__tests__/bundler/asset-collector.spec.ts`

Add tests:
- `extractHTMLUrls()` extracts img src
- `extractHTMLUrls()` extracts video/audio source src
- `extractHTMLUrls()` extracts poster attribute
- `extractHTMLUrls()` handles srcset
- `extractHTMLUrls()` skips external URLs
- `collectAssets()` includes layout template assets

**File**: `packages/cli/src/__tests__/bundler/html-generator.spec.ts`

Add tests:
- `rewriteHTMLUrls()` rewrites img src to asset path
- `rewriteHTMLUrls()` inlines small images as data URI
- `rewriteHTMLUrls()` preserves external URLs

### Tasks

| ID | Task | Est. |
|----|------|------|
| IMP2-T1 | Add `extractHTMLUrls()` function | 20min |
| IMP2-T2 | Add `extractLayoutTemplateAssets()` function | 10min |
| IMP2-T3 | Update `collectAssets()` to include layout assets | 15min |
| IMP2-T4 | Add `rewriteHTMLUrls()` function to html-generator | 20min |
| IMP2-T5 | Update index.ts to rewrite layout template URLs | 10min |
| IMP2-T6 | Write unit tests for HTML URL extraction | 25min |
| IMP2-T7 | Write unit tests for HTML URL rewriting | 20min |
| IMP2-T8 | Run full test suite and verify | 5min |

**Total**: ~2 hours

---

## Improvement 3: Asset Filename Collision Detection [MEDIUM PRIORITY]

### Problem

If two different source files have the same filename (e.g., `images/logo.png` and `icons/logo.png`), they both generate output path `assets/logo.png`. The second file overwrites the first.

### Solution

Detect filename collisions and add hash suffix to distinguish files.

### Implementation

**File**: `packages/cli/src/bundler/asset-collector.ts`

1. Track used output paths and detect collisions:

```typescript
/**
 * Generate a unique output filename, adding hash suffix if collision detected
 */
function generateUniqueOutputPath(
  sourcePath: string,
  usedPaths: Map<string, string>
): string {
  const fileName = path.basename(sourcePath);
  const baseName = path.basename(fileName, path.extname(fileName));
  const ext = path.extname(fileName);

  let outputPath = `assets/${fileName}`;

  // Check for collision
  const existingSource = usedPaths.get(outputPath);
  if (existingSource && existingSource !== sourcePath) {
    // Collision detected - add hash from source path
    const hash = createHash('md5').update(sourcePath).digest('hex').slice(0, 8);
    outputPath = `assets/${baseName}-${hash}${ext}`;
  }

  usedPaths.set(outputPath, sourcePath);
  return outputPath;
}
```

2. Update `collectAssets()` to use the collision-aware function:

```typescript
export function collectAssets(...): Effect.Effect<AssetManifest, ...> {
  return Effect.gen(function* () {
    const assets = new Map<string, AssetEntry>();
    const usedOutputPaths = new Map<string, string>(); // outputPath -> sourcePath

    // ... in the loop where assets are created:
    const outputPath = generateUniqueOutputPath(absolutePath, usedOutputPaths);

    const entry: AssetEntry = {
      // ...
      outputPath,
      // ...
    };
  });
}
```

3. Add logging for collision detection (optional):

```typescript
if (existingSource && existingSource !== sourcePath) {
  console.warn(`Asset filename collision detected: ${fileName}`);
  console.warn(`  Source 1: ${existingSource}`);
  console.warn(`  Source 2: ${sourcePath}`);
  console.warn(`  Using hashed path: ${outputPath}`);
}
```

### Tests

**File**: `packages/cli/src/__tests__/bundler/asset-collector.spec.ts`

Add tests:
- `generateUniqueOutputPath()` returns simple path when no collision
- `generateUniqueOutputPath()` adds hash when collision detected
- Same source path gets same output path (idempotent)
- Different sources with same filename get different output paths
- `collectAssets()` handles multiple CSS files referencing same-named but different files

### Tasks

| ID | Task | Est. |
|----|------|------|
| IMP3-T1 | Add `generateUniqueOutputPath()` function | 15min |
| IMP3-T2 | Update `collectAssets()` to track used paths | 10min |
| IMP3-T3 | Add collision warning logging | 5min |
| IMP3-T4 | Write unit tests for collision detection | 25min |
| IMP3-T5 | Write integration test with fixture | 20min |
| IMP3-T6 | Run full test suite and verify | 5min |

**Total**: ~1.5 hours

---

## Improvement 4: Source Location in AssetNotFoundError [LOW PRIORITY]

### Problem

`AssetNotFoundError` accepts a `sourceLocation` (line/column) but it's never populated. Error messages show which file referenced the asset but not which line.

### Solution

Track line numbers when parsing CSS URLs and include in error.

### Implementation

**File**: `packages/cli/src/bundler/asset-collector.ts`

1. Update `extractCSSUrls()` to return line information:

```typescript
interface CSSUrlRef {
  url: string;
  line: number;
}

/**
 * Extract url() references from CSS content with line numbers
 */
export function extractCSSUrlsWithLines(cssContent: string): CSSUrlRef[] {
  const urls: CSSUrlRef[] = [];
  const lines = cssContent.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    URL_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = URL_REGEX.exec(line)) !== null) {
      const url = match[2].trim();
      if (!isExternalUrl(url) && !isDataUri(url)) {
        urls.push({
          url,
          line: lineNum + 1, // 1-indexed
        });
      }
    }
  }

  return urls;
}
```

2. Update `collectAssets()` to pass line info to errors:

```typescript
for (const { url: urlRef, line } of extractCSSUrlsWithLines(cssContent)) {
  const absolutePath = resolveAssetPath(urlRef, cssFilePath);

  const stat = yield* Effect.tryPromise({
    try: () => fs.stat(absolutePath),
    catch: () => new AssetNotFoundError(absolutePath, cssFilePath, {
      file: cssFilePath,
      line,
      column: 0, // Column would require more complex parsing
    }),
  });
  // ...
}
```

### Tests

Add tests:
- `extractCSSUrlsWithLines()` returns correct line numbers
- `AssetNotFoundError` includes line in error message
- Error formatting shows source location

### Tasks

| ID | Task | Est. |
|----|------|------|
| IMP4-T1 | Add `extractCSSUrlsWithLines()` function | 15min |
| IMP4-T2 | Update `collectAssets()` to track lines | 10min |
| IMP4-T3 | Update error creation with source location | 10min |
| IMP4-T4 | Write unit tests | 20min |
| IMP4-T5 | Run full test suite and verify | 5min |

**Total**: ~1 hour

---

## Improvement 5: SC-006 Base64 Overhead Validation [LOW PRIORITY]

### Problem

**SC-006** states: "Image inlining reduces the number of HTTP requests by converting small images to data URIs **without increasing total bundle size by more than 33%** (base64 overhead)."

Base64 encoding increases size by ~37%, which exceeds the 33% target. Currently no validation or warning.

### Solution

Calculate and report base64 overhead. Warn if exceeding threshold.

### Implementation

**File**: `packages/cli/src/bundler/types.ts`

1. Add overhead tracking to `BundleStats`:

```typescript
export interface BundleStats {
  // ... existing fields

  /**
   * Total original size of inlined images (before base64)
   */
  inlinedOriginalSize: number;

  /**
   * Total size after base64 encoding (in CSS/HTML)
   */
  inlinedEncodedSize: number;

  /**
   * Base64 overhead percentage
   */
  inlineOverheadPercent: number;
}
```

**File**: `packages/cli/src/bundler/index.ts`

2. Calculate overhead during bundle creation:

```typescript
// After processing assets
let inlinedOriginalSize = 0;
let inlinedEncodedSize = 0;

for (const asset of manifest.assets.values()) {
  if (asset.inline && asset.dataUri) {
    inlinedOriginalSize += asset.size;
    inlinedEncodedSize += asset.dataUri.length;
  }
}

const inlineOverheadPercent = inlinedOriginalSize > 0
  ? ((inlinedEncodedSize - inlinedOriginalSize) / inlinedOriginalSize) * 100
  : 0;

// Add to stats
const stats: BundleStats = {
  // ...
  inlinedOriginalSize,
  inlinedEncodedSize,
  inlineOverheadPercent,
};
```

**File**: `packages/cli/src/main.ts`

3. Add warning when overhead exceeds 33%:

```typescript
// After bundle creation, before success message
if (result.stats.inlineOverheadPercent > 33) {
  console.log(chalk.yellow(
    `⚠ Base64 overhead is ${result.stats.inlineOverheadPercent.toFixed(1)}% ` +
    `(exceeds 33% target). Consider increasing --inline-threshold.`
  ));
}

// Update verbose output
if (options.verbose && result.stats.imagesInlined > 0) {
  console.log(chalk.gray(
    `  Inline overhead: ${result.stats.inlineOverheadPercent.toFixed(1)}%`
  ));
}
```

### Tests

Add tests:
- Overhead calculation is correct (~37% for typical images)
- Warning displayed when overhead > 33%
- No warning when overhead <= 33%
- Stats include overhead fields

### Tasks

| ID | Task | Est. |
|----|------|------|
| IMP5-T1 | Add overhead fields to BundleStats | 5min |
| IMP5-T2 | Calculate overhead in createBundle | 15min |
| IMP5-T3 | Add warning in CLI output | 10min |
| IMP5-T4 | Write unit tests | 20min |
| IMP5-T5 | Run full test suite and verify | 5min |

**Total**: ~55 minutes

---

## Summary

| # | Improvement | Priority | Est. Time | Dependencies |
|---|-------------|----------|-----------|--------------|
| 1 | CSS Minification | HIGH | 55min | esbuild |
| 2 | HTML Layout Image Parsing | MEDIUM | 2h | - |
| 3 | Asset Collision Detection | MEDIUM | 1.5h | crypto |
| 4 | Source Location in Errors | LOW | 1h | - |
| 5 | Base64 Overhead Validation | LOW | 55min | - |

**Total Estimated Time**: ~6.5 hours

### Recommended Order

1. **IMP1** - CSS Minification (completes FR-015)
2. **IMP3** - Asset Collision (prevents silent data loss)
3. **IMP2** - HTML Layout Images (completes US2)
4. **IMP5** - Overhead Validation (completes SC-006)
5. **IMP4** - Source Location (polish)

---

## Task List (All Improvements)

### Improvement 1: CSS Minification
- [ ] IMP1-T1: Add `minifyCSS()` function to css-processor.ts
- [ ] IMP1-T2: Update `processCSS()` to accept minify option
- [ ] IMP1-T3: Update `index.ts` to pass minify option
- [ ] IMP1-T4: Write unit tests for CSS minification
- [ ] IMP1-T5: Run full test suite and verify

### Improvement 2: HTML Layout Template Image Parsing
- [ ] IMP2-T1: Add `extractHTMLUrls()` function
- [ ] IMP2-T2: Add `extractLayoutTemplateAssets()` function
- [ ] IMP2-T3: Update `collectAssets()` to include layout assets
- [ ] IMP2-T4: Add `rewriteHTMLUrls()` function to html-generator
- [ ] IMP2-T5: Update index.ts to rewrite layout template URLs
- [ ] IMP2-T6: Write unit tests for HTML URL extraction
- [ ] IMP2-T7: Write unit tests for HTML URL rewriting
- [ ] IMP2-T8: Run full test suite and verify

### Improvement 3: Asset Filename Collision Detection
- [ ] IMP3-T1: Add `generateUniqueOutputPath()` function
- [ ] IMP3-T2: Update `collectAssets()` to track used paths
- [ ] IMP3-T3: Add collision warning logging
- [ ] IMP3-T4: Write unit tests for collision detection
- [ ] IMP3-T5: Write integration test with fixture
- [ ] IMP3-T6: Run full test suite and verify

### Improvement 4: Source Location in AssetNotFoundError
- [ ] IMP4-T1: Add `extractCSSUrlsWithLines()` function
- [ ] IMP4-T2: Update `collectAssets()` to track lines
- [ ] IMP4-T3: Update error creation with source location
- [ ] IMP4-T4: Write unit tests
- [ ] IMP4-T5: Run full test suite and verify

### Improvement 5: SC-006 Base64 Overhead Validation
- [ ] IMP5-T1: Add overhead fields to BundleStats
- [ ] IMP5-T2: Calculate overhead in createBundle
- [ ] IMP5-T3: Add warning in CLI output
- [ ] IMP5-T4: Write unit tests
- [ ] IMP5-T5: Run full test suite and verify

### Final Verification
- [ ] FINAL-T1: Run `pnpm run check` (Biome)
- [ ] FINAL-T2: Run `pnpm run build`
- [ ] FINAL-T3: Run full test suite with coverage
- [ ] FINAL-T4: Manual browser testing
- [ ] FINAL-T5: Update quickstart.md with new options/warnings
