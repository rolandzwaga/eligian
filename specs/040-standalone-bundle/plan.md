# Implementation Plan: Standalone Bundle Compilation

**Branch**: `040-standalone-bundle` | **Date**: 2025-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/040-standalone-bundle/spec.md`

## Summary

Add a `--bundle` CLI flag that produces a self-contained, deployable Eligius presentation. The bundle includes an HTML entry point, the Eligius runtime compiled to browser-compatible JavaScript, the compiled configuration embedded in the bundle, all CSS files combined, and all assets (images, fonts, media) collected into an output folder with correct relative path references.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+)
**Primary Dependencies**: esbuild (bundling), existing @eligian/language (compilation), chalk/commander (CLI)
**Storage**: File system (read source assets, write bundle output)
**Testing**: Vitest (unit tests), manual browser testing for integration
**Target Platform**: Node.js CLI producing browser-compatible output (ES2020+)
**Project Type**: Monorepo - extending `packages/cli`
**Performance Goals**: Bundle creation in under 10 seconds for typical presentations
**Constraints**: Output must work in all modern browsers, no runtime dependencies
**Scale/Scope**: Single presentations with up to 50 assets and 10 CSS files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | PASS | Extending existing CLI with new flag, reusing existing compilation pipeline |
| II. Comprehensive Testing | PASS | Will add unit tests for bundler modules, integration tests for full bundle |
| III. Type Safety with Effect | PASS | Bundle operations will use Effect for error handling |
| V. Test-Driven Development | PASS | Tests written before implementation |
| VI. External Immutability | PASS | Pure functions for asset processing |
| VIII. Package Manager | PASS | Using pnpm exclusively |
| XI. Code Quality with Biome | PASS | Will run check after each task |
| XIV. Windows Path Handling | PASS | Will use path.join for cross-platform paths |
| XXIII. Testing with vitest-mcp | PASS | Will use vitest-mcp tools for testing |
| XXV. Testing Guide Discipline | PASS | Will consult TESTING_GUIDE.md |

**Gate Status**: PASS - No violations, no justifications needed.

## Project Structure

### Documentation (this feature)

```text
specs/040-standalone-bundle/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (internal APIs)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/cli/
├── src/
│   ├── main.ts              # CLI entry - add --bundle flag
│   ├── compile-file.ts      # Existing compilation
│   ├── index.ts             # Library exports - add bundle exports
│   └── bundler/             # NEW: Bundle module
│       ├── index.ts         # Public API: createBundle()
│       ├── types.ts         # BundleOptions, BundleResult types
│       ├── asset-collector.ts    # Collect and track all assets
│       ├── css-processor.ts      # Combine CSS, rewrite URLs
│       ├── html-generator.ts     # Generate index.html
│       ├── runtime-bundler.ts    # Bundle Eligius + config to IIFE
│       └── image-inliner.ts      # Base64 encoding for small images
│
├── src/__tests__/
│   └── bundler/             # NEW: Bundler tests
│       ├── asset-collector.spec.ts
│       ├── css-processor.spec.ts
│       ├── html-generator.spec.ts
│       ├── runtime-bundler.spec.ts
│       ├── image-inliner.spec.ts
│       └── __fixtures__/
│           ├── sample-presentation/
│           │   ├── presentation.eligian
│           │   ├── styles/
│           │   └── assets/
│           └── expected-output/
│
└── templates/               # NEW: HTML/JS templates
    ├── index.html.template  # HTML bootstrap template
    └── runtime-wrapper.js   # Runtime initialization wrapper
```

**Structure Decision**: Extending the existing `packages/cli` package with a new `bundler/` module. This keeps bundle functionality co-located with the CLI while maintaining separation of concerns through the module structure.

## Complexity Tracking

> No violations to justify - all constraints satisfied.

| Aspect | Approach | Rationale |
|--------|----------|-----------|
| Runtime bundling | Use esbuild programmatically | Already a dev dependency, proven for bundling |
| Asset collection | Walk AST + parse CSS | Reuse existing CSS parser infrastructure |
| Path rewriting | Relative paths from output root | Simplest approach for static hosting |

## Phase 0: Research (Complete)

See [research.md](./research.md) for detailed findings on:
- Eligius runtime architecture and dependencies
- Resource importer pattern for operation loading
- esbuild configuration for browser bundles (IIFE format)
- CSS URL rewriting strategy with PostCSS
- Image inlining threshold decision (50KB default)
- HTML template structure
- Asset collection algorithm

**Key Decisions**:
- Bundle format: IIFE for maximum browser compatibility
- jQuery: Always bundled (required by Eligius core)
- Video.js/Lottie: Conditional inclusion based on usage
- CSS: Inline in HTML (reduces HTTP requests)
- Assets: Flat `assets/` folder structure

## Phase 1: Design (Complete)

### Data Model

See [data-model.md](./data-model.md) for complete type definitions:
- `BundleOptions` - Configuration for bundle creation
- `BundleResult` - Result with files and statistics
- `AssetManifest` - Internal asset tracking structure
- `BundleError` hierarchy - Typed error classes

### Internal Module Contracts

See [contracts/](./contracts/) directory:
- [bundler-index.md](./contracts/bundler-index.md) - Main orchestration and public API
- [asset-collector.md](./contracts/asset-collector.md) - Asset discovery and manifest building
- [css-processor.md](./contracts/css-processor.md) - CSS combination and URL rewriting
- [html-generator.md](./contracts/html-generator.md) - HTML entry point generation
- [runtime-bundler.md](./contracts/runtime-bundler.md) - Eligius runtime bundling with esbuild
- [image-inliner.md](./contracts/image-inliner.md) - Base64 conversion for small images

### Usage Guide

See [quickstart.md](./quickstart.md) for:
- CLI usage examples
- Programmatic API examples
- Bundle structure documentation
- Deployment instructions
- Troubleshooting guide

## Phase 2: Tasks (Complete)

See [tasks.md](./tasks.md) for the full implementation task list.

**Summary**:
- **49 tasks** total across 7 phases
- **4 user story phases** (P1-P4) with independent checkpoints
- **TDD approach**: Tests written before implementation

**Phase Breakdown**:
1. **Phase 1: Setup** (4 tasks) - Project structure and types
2. **Phase 2: Foundational** (5 tasks) - Image inliner and HTML generator
3. **Phase 3: US1 - Basic Bundle** (9 tasks) - MVP: runtime bundling and CLI flag
4. **Phase 4: US2 - Asset Collection** (8 tasks) - CSS and asset handling
5. **Phase 5: US3 - Image Inlining** (7 tasks) - Base64 inlining optimization
6. **Phase 6: US4 - Customization** (10 tasks) - CLI options and minification
7. **Phase 7: Polish** (6 tasks) - Documentation and final testing

**MVP Scope**: Complete through Phase 3 (User Story 1) for basic bundle functionality.
