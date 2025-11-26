# Quickstart Guide: Standalone Bundle Compilation

**Feature**: 040-standalone-bundle
**Date**: 2025-01-25

## Overview

The standalone bundle feature creates a self-contained, deployable Eligius presentation from your `.eligian` source file. The output can be deployed to any static hosting service (GitHub Pages, Netlify, S3, etc.) without requiring any build tools at the deployment target.

## Basic Usage

### Create a Bundle (CLI)

```bash
# Basic bundle creation
eligian presentation.eligian --bundle

# Output: presentation.bundle/
#   ├── index.html
#   ├── bundle.js
#   └── assets/
#       └── ... (images, fonts, media)
```

### Create a Bundle (Programmatic)

```typescript
import { createBundle } from '@eligian/cli';
import { Effect } from 'effect';

const result = await Effect.runPromise(
  createBundle('./presentation.eligian')
);

console.log(`Bundle created at: ${result.outputDir}`);
console.log(`Total size: ${(result.stats.totalSize / 1024).toFixed(1)} KB`);
```

## CLI Options

### Output Directory

```bash
# Specify custom output directory
eligian presentation.eligian --bundle -o ./dist/my-bundle

# Default: <input>.bundle (e.g., presentation.bundle/)
```

### Minification

```bash
# Minify JavaScript and CSS for production
eligian presentation.eligian --bundle --minify
```

### Image Inlining Threshold

```bash
# Inline images smaller than 100KB (default: 50KB)
eligian presentation.eligian --bundle --inline-threshold 102400

# Disable image inlining entirely
eligian presentation.eligian --bundle --inline-threshold 0
```

### Force Overwrite

```bash
# Overwrite existing output directory
eligian presentation.eligian --bundle --force
```

### Source Maps

```bash
# Include inline source maps for debugging
eligian presentation.eligian --bundle --sourcemap
```

### Combined Options

```bash
# Production build with all optimizations
eligian presentation.eligian --bundle -o ./dist --minify --force
```

## Programmatic API

### Full Options

```typescript
import { createBundle, BundleOptions } from '@eligian/cli';
import { Effect } from 'effect';

const options: BundleOptions = {
  outputDir: './dist/bundle',      // Output directory
  minify: true,                    // Minify JS/CSS
  inlineThreshold: 51200,          // 50KB threshold
  sourcemap: false,                // No source maps
  force: true                      // Overwrite existing
};

const result = await Effect.runPromise(
  createBundle('./presentation.eligian', options)
);
```

### Result Object

```typescript
interface BundleResult {
  outputDir: string;        // Absolute path to output
  files: BundleFile[];      // List of generated files
  stats: BundleStats;       // Bundle statistics
}

interface BundleFile {
  path: string;             // Relative path in bundle
  size: number;             // Size in bytes
  type: 'html' | 'javascript' | 'css' | 'image' | 'font' | 'media' | 'other';
}

interface BundleStats {
  fileCount: number;        // Total files generated
  totalSize: number;        // Total size in bytes
  imagesInlined: number;    // Images converted to base64
  imagesCopied: number;     // Images copied to assets/
  cssFilesCombined: number; // CSS files combined
  bundleTime: number;       // Bundle creation time (ms)
}
```

### Error Handling

```typescript
import { createBundle, BundleError, OutputExistsError, AssetNotFoundError } from '@eligian/cli';
import { Effect } from 'effect';

const program = Effect.gen(function* (_) {
  try {
    return yield* _(createBundle('./presentation.eligian'));
  } catch (error) {
    if (error instanceof OutputExistsError) {
      console.error(`Output exists: ${error.outputDir}`);
      console.error('Use --force to overwrite');
    } else if (error instanceof AssetNotFoundError) {
      console.error(`Asset not found: ${error.assetPath}`);
      console.error(`Referenced in: ${error.sourceFile}`);
    } else {
      throw error;
    }
  }
});

await Effect.runPromise(program);
```

## Bundle Structure

```
my-presentation.bundle/
├── index.html          # Entry point - open in browser
├── bundle.js           # Eligius runtime + your configuration
└── assets/
    ├── hero.jpg        # Large images (over threshold)
    ├── video.mp4       # Videos (never inlined)
    └── fonts/
        └── custom.woff2  # Font files
```

### What Gets Inlined

| Asset Type | Behavior |
|------------|----------|
| Small images (< 50KB) | Embedded as base64 in CSS |
| Large images (≥ 50KB) | Copied to assets/ |
| Videos | Always copied to assets/ |
| Audio | Always copied to assets/ |
| Fonts | Copied to assets/ |
| CSS | Combined and embedded in HTML |

## Deployment

### Static Hosting

The bundle is ready for deployment to any static hosting service:

```bash
# GitHub Pages
git add my-presentation.bundle/
git commit -m "Add presentation bundle"
git push

# Netlify (via CLI)
netlify deploy --dir=my-presentation.bundle

# AWS S3
aws s3 sync my-presentation.bundle/ s3://my-bucket/
```

### Local Testing

```bash
# Using Python
python -m http.server 8000 --directory my-presentation.bundle

# Using Node.js (npx serve)
npx serve my-presentation.bundle

# Then open http://localhost:8000 in browser
```

## Example: Complete Workflow

### 1. Create Your Presentation

```eligian
// presentation.eligian
styles "./styles/main.css"
styles "./styles/animations.css"

layout "#container" {
  <div id="container">
    <div class="slide" id="intro"></div>
    <div class="slide" id="content"></div>
  </div>
}

action fadeIn(selector: string) [
  selectElement(selector)
  animate({opacity: 1}, 500)
]

timeline "My Presentation" at 0s video "./assets/background.mp4" {
  at 0s..3s fadeIn("#intro")
  at 3s..6s fadeIn("#content")
}
```

### 2. Create the Bundle

```bash
eligian presentation.eligian --bundle --minify -o ./dist
```

### 3. Verify the Output

```bash
ls -la ./dist/
# index.html (entry point)
# bundle.js (minified runtime)
# assets/
#   background.mp4 (video file)
#   ... (other assets)
```

### 4. Test Locally

```bash
npx serve ./dist
# Open http://localhost:3000
```

### 5. Deploy

```bash
# Example: Deploy to Netlify
netlify deploy --prod --dir=./dist
```

## Troubleshooting

### Asset Not Found Error

```
BundleError: Asset not found: ./images/missing.png
Referenced in: styles/main.css (line 15)
```

**Solution**: Check that the referenced file exists at the specified path relative to the CSS file.

### Output Directory Exists

```
OutputExistsError: Output directory already exists: ./dist
Use --force to overwrite.
```

**Solution**: Use `--force` flag or delete the existing directory.

### Large Bundle Size

If your bundle is unexpectedly large:

1. Check for large images that could be optimized
2. Consider using `--inline-threshold 0` to keep all images as files
3. Use `--minify` for production builds
4. Review if video.js is being bundled (only needed for video timelines)

### Browser Compatibility

The bundle targets ES2020 and works in:
- Chrome 80+
- Firefox 74+
- Safari 14+
- Edge 80+

For older browsers, you may need to add polyfills manually.
