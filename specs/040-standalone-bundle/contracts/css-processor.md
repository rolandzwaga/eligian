# Contract: CSS Processor

**Module**: `packages/cli/src/bundler/css-processor.ts`

## Purpose

Combines multiple CSS files into a single string, rewriting all `url()` references to point to the bundle's asset paths. Handles image inlining for small assets.

## Public API

```typescript
import { Effect } from 'effect';

/**
 * Process CSS files: combine, rewrite URLs, inline small images
 *
 * @param cssFiles - Array of CSS file paths (in order)
 * @param manifest - Asset manifest with inline decisions
 * @param basePath - Base path for resolving relative references
 * @returns Effect that resolves to processed CSS string
 */
export function processCSS(
  cssFiles: string[],
  manifest: AssetManifest,
  basePath: string
): Effect.Effect<string, CSSProcessError>;

/**
 * Rewrite a single CSS file's URLs
 *
 * @param cssContent - CSS content string
 * @param cssFilePath - Path to the CSS file (for resolving relative URLs)
 * @param manifest - Asset manifest
 * @returns Processed CSS string
 */
export function rewriteCSSUrls(
  cssContent: string,
  cssFilePath: string,
  manifest: AssetManifest
): string;

/**
 * Error during CSS processing
 */
export type CSSProcessError =
  | FileReadError
  | CSSParseError;
```

## Behavior

### URL Rewriting Rules

| Original URL | Asset State | Rewritten URL |
|--------------|-------------|---------------|
| `url('./images/logo.png')` | Inlined | `url('data:image/png;base64,...')` |
| `url('./images/hero.jpg')` | Copied | `url('assets/hero.jpg')` |
| `url('https://cdn.example.com/img.png')` | External | `url('https://cdn.example.com/img.png')` (unchanged) |
| `url('data:image/svg+xml,...')` | Data URI | `url('data:image/svg+xml,...')` (unchanged) |

### CSS Combination Order

CSS files are concatenated in the order provided, preserving cascade rules:

```css
/* === Source: main.css === */
.button { color: blue; }

/* === Source: theme.css === */
.button { color: red; }  /* This wins in cascade */
```

### URL Resolution

```
CSS file location: /project/styles/components/button.css
URL in CSS: url('../../images/icon.png')
Resolved absolute: /project/images/icon.png
Manifest lookup: assets.get('/project/images/icon.png')
Output URL: url('assets/icon.png')  OR  url('data:...')
```

### PostCSS Integration

Uses PostCSS to parse and transform CSS:

```typescript
import postcss from 'postcss';

function rewriteCSSUrls(content: string, filePath: string, manifest: AssetManifest): string {
  const root = postcss.parse(content, { from: filePath });

  root.walkDecls(decl => {
    decl.value = decl.value.replace(
      /url\(['"]?([^'")]+)['"]?\)/g,
      (match, url) => {
        // Skip external URLs and data URIs
        if (isExternal(url) || isDataUri(url)) {
          return match;
        }

        const resolved = resolveUrl(url, filePath);
        const asset = manifest.assets.get(resolved);

        if (asset?.inline && asset.dataUri) {
          return `url('${asset.dataUri}')`;
        }
        if (asset) {
          return `url('${asset.outputPath}')`;
        }

        // Asset not in manifest - leave unchanged (error reported elsewhere)
        return match;
      }
    );
  });

  return root.toString();
}
```

## Error Handling

| Error | Condition | Recovery |
|-------|-----------|----------|
| `FileReadError` | Cannot read CSS file | Report path and system error |
| `CSSParseError` | CSS has syntax errors | Report with line/column info |

## Example Usage

```typescript
import { Effect } from 'effect';
import { processCSS } from './css-processor';

const combinedCSS = await Effect.runPromise(
  processCSS(
    ['./styles/main.css', './styles/theme.css'],
    assetManifest,
    '/project/src'
  )
);

// Result: single CSS string with all URLs rewritten
```

## Dependencies

- `postcss` - CSS parsing and transformation
- `node:fs/promises` - File reading
- `node:path` - Path resolution

## Test Cases

1. **Single CSS file** - Rewrite URLs correctly
2. **Multiple CSS files** - Combine in order
3. **Image inlining** - Replace with data URI
4. **External URLs** - Leave http/https unchanged
5. **Data URIs** - Leave unchanged
6. **Mixed paths** - Handle relative, absolute, parent directory refs
7. **Font URLs** - Handle @font-face src correctly
8. **No URLs** - Return CSS unchanged
9. **Empty CSS** - Return empty string
10. **CSS with comments** - Preserve comments
