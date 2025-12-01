# Implementation Plan: HTML Element Completion for createElement

**Branch**: `043-html-element-completion` | **Date**: 2025-12-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/043-html-element-completion/spec.md`

## Summary

Add intelligent code completion for the `createElement` operation that provides:
1. HTML element name suggestions (all 112 standard elements from `HTMLElementTagNameMap`)
2. Context-aware attribute completions based on the selected element type (e.g., `src`, `alt` for `<img>`)
3. Enumerated value completions for constrained attributes (e.g., input `type` values)

The implementation uses a build-time metadata generator that extracts type information from TypeScript's DOM lib definitions, following the established CSS completion pattern in the codebase.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Langium (language server), TypeScript Compiler API (metadata generation)
**Storage**: Generated metadata files (`.generated.ts`)
**Testing**: Vitest (following existing test patterns)
**Target Platform**: VS Code extension (language server)
**Project Type**: Monorepo with packages (language, extension, cli, compiler)
**Performance Goals**: <100ms completion response time (per SC-004)
**Constraints**: Must handle 112 elements × ~50 attributes each; generated file size reasonable
**Scale/Scope**: 112 HTML elements, 20+ element-specific interfaces, 10+ enumerated attributes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | ✅ PASS | Follows established CSS completion pattern |
| II. Comprehensive Testing | ✅ PASS | Unit tests for generator, integration tests for completions |
| III. Type Safety with Effect | ✅ PASS | Completion provider uses Langium patterns (no Effect needed) |
| V. TDD | ✅ PASS | Tests written before implementation |
| VI. External Immutability | ✅ PASS | Generated metadata is readonly |
| VII. Functional Programming | ✅ PASS | Pure functions for context detection and completion |
| VIII. Package Manager | ✅ PASS | pnpm only |
| XI. Biome | ✅ PASS | All code formatted/linted |
| XX. Testing Strategy | ✅ PASS | Tests in `__tests__/` directories |
| XXIV. Test Helpers | ✅ PASS | Use createTestContext(), setupCSSRegistry() patterns |
| XXV. Testing Guide | ✅ PASS | Consult specs/TESTING_GUIDE.md |

### Post-Design Re-Check (Phase 1 Complete)

All principles verified after design artifacts created:
- ✅ Contracts define pure function interfaces (VII)
- ✅ Generated metadata uses `readonly` types (VI)
- ✅ Test structure follows `__tests__/` pattern (XX)
- ✅ No complexity violations requiring justification

## Project Structure

### Documentation (this feature)

```text
specs/043-html-element-completion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/language/src/
├── completion/
│   ├── html-elements.ts           # HTML element completion provider (NEW)
│   ├── html-elements.generated.ts # Generated metadata (NEW)
│   └── __tests__/
│       └── html-elements.spec.ts  # Completion tests (NEW)
├── html/
│   ├── context-detection.ts       # Detect createElement context (NEW)
│   ├── metadata-types.ts          # TypeScript interfaces for metadata (NEW)
│   └── __tests__/
│       └── context-detection.spec.ts  # Context detection tests (NEW)
└── eligian-completion-provider.ts # Integration point (MODIFY)

scripts/
└── generate-html-metadata.ts      # Build-time generator script (NEW)
```

**Structure Decision**: Follow existing completion module pattern (see `completion/operations.ts`, `css/context-detection.ts`). New modules in `html/` for context detection, completion logic in `completion/`.

## Complexity Tracking

No constitution violations. The design follows established patterns:
- CSS completion for className/selector (pattern for in-string completion)
- Controller completion for context-aware suggestions (pattern for parameter-position detection)
- Operations metadata generation (pattern for build-time metadata extraction)
