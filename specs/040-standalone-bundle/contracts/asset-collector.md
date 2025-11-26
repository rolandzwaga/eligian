# Contract: Asset Collector

**Module**: `packages/cli/src/bundler/asset-collector.ts`

## Purpose

Collects all assets referenced in CSS files and configuration, building a manifest for the bundler. Resolves relative paths and determines which assets should be inlined vs copied.

## Public API

```typescript
import { Effect } from 'effect';

/**
 * Collect all assets from CSS files and configuration
 *
 * @param config - Compiled Eligius configuration
 * @param cssFiles - Array of CSS file paths
 * @param basePath - Base path for resolving relative references
 * @param options - Collection options
 * @returns Effect that resolves to AssetManifest
 */
export function collectAssets(
  config: IEngineConfiguration,
  cssFiles: string[],
  basePath: string,
  options: CollectOptions
): Effect.Effect<AssetManifest, AssetCollectionError>;

/**
 * Options for asset collection
 */
export interface CollectOptions {
  /**
   * Threshold in bytes for inlining images
   */
  inlineThreshold: number;
}

/**
 * Error during asset collection
 */
export type AssetCollectionError =
  | AssetNotFoundError
  | CSSParseError
  | FileReadError;
```

## Behavior

### Input Sources

1. **CSS Files**: Parse each CSS file and extract `url()` references
   - Background images: `background: url(...)`
   - Font faces: `src: url(...)`
   - List style images: `list-style-image: url(...)`
   - Cursor images: `cursor: url(...)`
   - Content: `content: url(...)`

2. **Configuration**: Extract asset paths from:
   - Timeline provider sources (video URLs)
   - Layout template `<img src="...">` tags (if present)

### URL Resolution

```
CSS file: /project/styles/main.css
Reference: url('../images/hero.png')
Resolved: /project/images/hero.png
Output: assets/hero.png
```

### Inlining Decision

```typescript
function shouldInline(asset: AssetEntry, threshold: number): boolean {
  // Never inline media files
  if (NEVER_INLINE_EXTENSIONS.has(path.extname(asset.sourcePath))) {
    return false;
  }
  // Inline if under threshold
  return asset.size <= threshold;
}
```

### Deduplication

Assets referenced multiple times are tracked once with multiple sources:

```typescript
// Same image referenced in two CSS files
manifest.assets.get('images/logo.png') = {
  sources: [
    { file: 'main.css', type: 'css-url', line: 10 },
    { file: 'header.css', type: 'css-url', line: 5 }
  ],
  // ... other properties
}
```

## Error Handling

| Error | Condition | Recovery |
|-------|-----------|----------|
| `AssetNotFoundError` | Referenced file doesn't exist | Report with source location |
| `CSSParseError` | CSS file has syntax errors | Use existing CSS parser error info |
| `FileReadError` | Cannot read CSS or asset file | Report file path and system error |

## Example Usage

```typescript
import { Effect, pipe } from 'effect';
import { collectAssets } from './asset-collector';

const manifest = await Effect.runPromise(
  collectAssets(
    eligiusConfig,
    ['./styles/main.css', './styles/theme.css'],
    '/project/src',
    { inlineThreshold: 51200 }
  )
);

console.log(`Found ${manifest.assets.size} assets`);
console.log(`CSS combined: ${manifest.combinedCSS.length} bytes`);
```

## Dependencies

- `postcss` - CSS parsing (via @eligian/language)
- `node:fs/promises` - File system operations
- `node:path` - Path resolution

## Test Cases

1. **Single CSS file with images** - Collect all url() references
2. **Multiple CSS files** - Combine and deduplicate assets
3. **External URLs** - Skip http:// and https:// URLs
4. **Data URIs** - Skip data: URLs
5. **Missing asset** - Return error with source location
6. **Empty CSS file** - Return empty manifest
7. **CSS with syntax errors** - Propagate parse error
8. **Various path formats** - Handle `./../`, `./`, absolute paths
