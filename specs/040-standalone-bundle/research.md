# Research: Standalone Bundle Compilation

**Feature**: 040-standalone-bundle
**Date**: 2025-01-25

## Executive Summary

This document captures research findings for implementing standalone bundle compilation in the Eligian CLI. The bundle feature will produce self-contained, deployable Eligius presentations that work without any build tooling at the deployment target.

## Key Findings

### 1. Eligius Runtime Architecture

**Source Analysis**: `f:/projects/eligius/eligius/src/`

The Eligius library has the following key components that must be bundled:

1. **EligiusEngine** (`eligius-engine.ts`) - Core timeline execution engine
2. **EngineFactory** (`engine-factory.ts`) - Factory for creating engine instances
3. **ConfigurationResolver** - Resolves configuration and creates actions
4. **TimelineProviders** - Various timeline sources (video, animation frame, etc.)
5. **Operations** - All operations used in the configuration
6. **Controllers** - Event handlers and action controllers

**Dependencies** (from `package.json`):
- **Peer dependencies** (must be bundled or externalized):
  - `jquery@3.7.1` - DOM manipulation (required)
  - `lottie-web@5.13.0` - Animation support (optional)
  - `video.js@8.23.4` - Video player (optional, only if video timeline used)
- **Runtime dependencies**:
  - `hotkeys-js@3.13.15` - Keyboard shortcuts
  - `ts-is-present@1.2.2` - Type utilities
  - `uuid@13.0.0` - UUID generation

**Decision**: Bundle jQuery with the runtime (always needed). Lottie and video.js should be conditionally included based on whether they're used in the presentation.

### 2. Resource Importer Pattern

**Source Analysis**: `f:/projects/eligius/eligius/src/build/generate-importer-source-code.ts`

Eligius uses a resource importer pattern to dynamically load operations, controllers, and engines:

```typescript
class EligiusResourceImporter implements ISimpleResourceImporter {
  import(name: string): Record<string, any> {
    if (imports.hasOwnProperty(name)) { return imports[name]; }
    throw Error("Unknown systemName: " + name);
  }
}
```

**Implication**: The bundle must include a pre-built importer with all necessary operations statically imported and available.

**Decision**: Generate a custom importer at bundle time that includes only the operations used in the compiled configuration. This minimizes bundle size by excluding unused operations.

### 3. esbuild Configuration for Browser Bundle

**Existing Pattern**: `packages/cli/esbuild.mjs`

Current CLI builds use:
- `format: 'esm'` - ES modules
- `platform: 'node'` - Node.js target
- `packages: 'external'` - External dependencies

**Required Changes for Browser Bundle**:
```javascript
{
  entryPoints: ['runtime-wrapper.js'],
  outfile: 'bundle.js',
  bundle: true,
  target: 'ES2020',           // Browser compatibility
  format: 'iife',             // Immediately Invoked Function Expression
  globalName: 'EligiusBundled', // Global namespace (optional)
  platform: 'browser',        // Browser target
  minify: options.minify,
  external: [],               // Bundle everything (no externals)
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}
```

**Decision**: Use IIFE format for maximum browser compatibility. The runtime will be self-contained with no external dependencies.

### 4. CSS URL Rewriting

**Existing Infrastructure**: `packages/language/src/css/css-parser.ts`

PostCSS is already available in the language package for CSS parsing. We can use it for URL rewriting as well.

**CSS URL Patterns to Handle**:
```css
/* Relative paths - need rewriting */
.bg { background: url('./images/hero.png'); }
.font { src: url('../fonts/custom.woff2'); }

/* Data URIs - leave as-is */
.icon { background: url('data:image/svg+xml,...'); }

/* External URLs - leave as-is */
.cdn { background: url('https://cdn.example.com/image.png'); }
```

**Rewriting Strategy**:
1. Parse CSS with PostCSS
2. Walk all `url()` values
3. For relative paths: resolve against CSS file location, then rewrite to `assets/` relative path
4. For data URIs and external URLs: preserve unchanged

**Decision**: Use PostCSS with `postcss-url` plugin or manual AST walking for URL rewriting. Collect asset references during the rewrite pass.

### 5. Image Inlining

**Threshold Decision**: 50KB default

**Rationale**:
- Base64 encoding adds ~33% overhead (3 bytes become 4 characters)
- 50KB image becomes ~67KB as base64
- HTTP/2 multiplexing reduces the benefit of inlining
- Small icons (< 10KB) benefit most from inlining
- 50KB strikes a balance between reducing requests and bundle size

**MIME Type Mapping**:
```typescript
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};
```

**Decision**: Inline images up to 50KB by default. Make threshold configurable via `--inline-threshold` flag. Never inline video/audio files.

### 6. HTML Template Generation

**Minimal HTML Structure**:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <style>{{inlinedCSS}}</style>
  <!-- OR -->
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="eligius-container">
    {{layoutTemplate}}
  </div>
  <script src="bundle.js"></script>
  <script>
    EligiusBundled.init(document.getElementById('eligius-container'));
  </script>
</body>
</html>
```

**Decision**: Generate a minimal HTML file with:
- Inline CSS (combined from all `styles` imports)
- Layout template from configuration (if present)
- Single script tag for the JavaScript bundle
- Initialization script that starts the engine

### 7. Asset Collection Strategy

**Asset Sources**:
1. **CSS `url()` references** - Images, fonts referenced in stylesheets
2. **Configuration assets** - Video/audio sources in timeline providers
3. **Layout template** - Image sources in `<img>` tags

**Collection Algorithm**:
```typescript
interface AssetCollector {
  // Scan all sources and build manifest
  collect(config: IEngineConfiguration, cssFiles: string[]): AssetManifest;
}

interface AssetManifest {
  assets: Map<string, AssetEntry>;
  cssContent: string;  // Combined, URL-rewritten CSS
}

interface AssetEntry {
  originalPath: string;      // Original reference path
  sourcePath: string;        // Absolute source file path
  outputPath: string;        // Relative path in output
  shouldInline: boolean;     // Based on size and type
  dataUri?: string;          // Base64 data URI if inlined
}
```

**Decision**: Implement a two-pass collection:
1. First pass: Discover all referenced assets
2. Second pass: Process assets (copy or inline) and rewrite references

### 8. Output Structure

**Folder Layout**:
```
output/
├── index.html        # Entry point
├── bundle.js         # Eligius runtime + config
├── styles.css        # Combined CSS (optional if all CSS is inlined in HTML)
└── assets/
    ├── images/       # Non-inlined images
    ├── fonts/        # Font files
    └── media/        # Video/audio files
```

**Decision**: Use flat `assets/` folder initially. Can add subfolders if asset count warrants it. Videos always go to `assets/media/`.

### 9. Runtime Wrapper Design

The runtime wrapper needs to:
1. Initialize the Eligius engine with embedded configuration
2. Handle DOM ready state
3. Provide optional devtools integration

**Runtime Wrapper Template**:
```javascript
(function() {
  'use strict';

  // Embedded configuration (injected at bundle time)
  const CONFIG = __ELIGIUS_CONFIG__;

  // Create resource importer with bundled operations
  const importer = new EligiusResourceImporter();

  // Initialize on DOM ready
  function init(container) {
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }

    const factory = new EngineFactory(importer, window);
    const engine = factory.createEngine(CONFIG);

    return engine.init();
  }

  // Auto-initialize if container exists
  document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('eligius-container');
    if (container) {
      init(container);
    }
  });

  // Export for manual initialization
  window.EligiusBundled = { init: init };
})();
```

**Decision**: Use IIFE pattern with optional auto-initialization. Allow manual initialization via `EligiusBundled.init()` for advanced use cases.

## Technical Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bundle format | IIFE | Maximum browser compatibility |
| jQuery handling | Bundle with runtime | Always required by Eligius |
| Video.js handling | Conditional include | Only needed for video timelines |
| Image inline threshold | 50KB default | Balance between requests and size |
| CSS handling | Inline in HTML | Reduces HTTP requests |
| Asset organization | Flat `assets/` folder | Simple, compatible with all hosts |
| Operation bundling | Static imports | Analyze config, include only used ops |
| URL rewriting | PostCSS AST walking | Reuse existing infrastructure |

## Open Questions (Resolved)

1. **Q: Should CSS be inlined in HTML or separate file?**
   **A**: Inline in HTML for simplicity. One less file to manage.

2. **Q: Should we support source maps?**
   **A**: Yes, optionally via `--sourcemap` flag. Useful for debugging.

3. **Q: How to handle missing assets?**
   **A**: Fail fast with clear error message including source location.

## Dependencies to Add

**New dev dependencies for `@eligian/cli`**:
- `esbuild` - Already a dev dependency (workspace root)
- `postcss` - Already available via `@eligian/language`
- No new dependencies required!

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large bundle size | Medium | Tree-shaking via operation analysis |
| Browser compatibility | Low | Target ES2020 (supported by all modern browsers) |
| Asset path resolution | Medium | Thorough testing with various path formats |
| Video.js size | Medium | Make conditional based on timeline type |

## Next Steps

1. Create data model for `BundleOptions` and `BundleResult` types
2. Design internal module contracts (asset-collector, css-processor, etc.)
3. Write quickstart documentation
4. Generate implementation tasks
