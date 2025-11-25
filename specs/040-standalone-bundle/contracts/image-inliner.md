# Contract: Image Inliner

**Module**: `packages/cli/src/bundler/image-inliner.ts`

## Purpose

Converts images to base64 data URIs for embedding in CSS or HTML. Handles MIME type detection and respects size thresholds.

## Public API

```typescript
import { Effect } from 'effect';

/**
 * Convert an image file to a base64 data URI
 *
 * @param filePath - Absolute path to the image file
 * @returns Effect that resolves to data URI string
 */
export function inlineImage(
  filePath: string
): Effect.Effect<string, ImageInlineError>;

/**
 * Check if a file should be inlined based on size and type
 *
 * @param filePath - Absolute path to the file
 * @param threshold - Maximum size in bytes for inlining
 * @returns Effect that resolves to inlining decision with metadata
 */
export function shouldInline(
  filePath: string,
  threshold: number
): Effect.Effect<InlineDecision, FileStatError>;

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

/**
 * Error during image inlining
 */
export type ImageInlineError =
  | FileNotFoundError
  | FileReadError
  | UnsupportedFormatError;

export class UnsupportedFormatError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly extension: string
  ) {
    super(`Unsupported image format: ${extension}`);
    this.name = 'UnsupportedFormatError';
  }
}
```

## Behavior

### Data URI Format

```
data:{mimeType};base64,{base64Content}
```

Example:
```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
```

### MIME Type Detection

```typescript
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
};
```

### Never-Inline Types

These file types are never inlined regardless of size:

```typescript
const NEVER_INLINE = new Set([
  // Video
  '.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv',
  // Audio
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg',
]);
```

### Inlining Decision Logic

```typescript
function shouldInline(filePath: string, threshold: number): InlineDecision {
  const ext = path.extname(filePath).toLowerCase();

  // Never inline media files
  if (NEVER_INLINE.has(ext)) {
    return {
      shouldInline: false,
      size: stats.size,
      mimeType: getMimeType(ext),
      reason: 'never-inline-type'
    };
  }

  // Check size threshold
  const stats = await fs.stat(filePath);
  if (stats.size > threshold) {
    return {
      shouldInline: false,
      size: stats.size,
      mimeType: getMimeType(ext),
      reason: 'over-threshold'
    };
  }

  return {
    shouldInline: true,
    size: stats.size,
    mimeType: getMimeType(ext),
    reason: 'under-threshold'
  };
}
```

### SVG Special Handling

SVG files can be URL-encoded instead of base64 for smaller output:

```typescript
function inlineSVG(content: string): string {
  // URL-encode SVG for smaller data URI
  const encoded = encodeURIComponent(content)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}
```

**Decision**: Use URL encoding for SVG, base64 for all other formats.

## Error Handling

| Error | Condition | Recovery |
|-------|-----------|----------|
| `FileNotFoundError` | File doesn't exist | Report path |
| `FileReadError` | Can't read file | Report path and system error |
| `UnsupportedFormatError` | Unknown extension | Report extension, suggest copying instead |

## Example Usage

```typescript
import { Effect, pipe } from 'effect';
import { inlineImage, shouldInline } from './image-inliner';

// Check if should inline
const decision = await Effect.runPromise(
  shouldInline('/project/images/logo.png', 51200)
);

if (decision.shouldInline) {
  const dataUri = await Effect.runPromise(
    inlineImage('/project/images/logo.png')
  );
  console.log(dataUri); // data:image/png;base64,...
}
```

## Dependencies

- `node:fs/promises` - File reading
- `node:path` - Extension extraction

## Test Cases

1. **PNG image under threshold** - Returns data URI
2. **JPEG image over threshold** - Decision: don't inline
3. **SVG image** - URL-encoded data URI
4. **Video file** - Never inline regardless of size
5. **Audio file** - Never inline regardless of size
6. **Unknown extension** - Returns octet-stream MIME type
7. **File not found** - Returns FileNotFoundError
8. **Zero-byte file** - Handles edge case
9. **Large file** - Handles multi-megabyte files efficiently
10. **Font files** - Correct MIME types for woff/woff2/ttf
