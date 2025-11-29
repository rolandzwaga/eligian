# Implementation Plan: Missing Label Entry Quick Fix

**Branch**: `041-label-entry-quickfix` | **Date**: 2025-11-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/041-label-entry-quickfix/spec.md`

## Summary

This feature adds a quick fix code action that creates a missing label entry in the labels file when a developer uses an undefined label ID in their Eligian code. The quick fix creates a properly structured JSON entry with empty translations for all languages defined in the Eligian file's languages block.

The implementation leverages the existing code action infrastructure (Feature 039) and label validation system (Feature 034) by:
1. Extending the code action provider to detect `unknown_label_id` diagnostics
2. Extracting language codes from the languages block AST
3. Generating a new label entry with UUID-identified translations
4. Modifying the existing labels JSON file atomically

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js runtime)
**Primary Dependencies**: Langium (LSP), vscode-languageserver-protocol, Node.js fs/promises
**Storage**: Labels JSON files (filesystem)
**Testing**: Vitest with vitest-mcp tools
**Target Platform**: VS Code extension (Windows, macOS, Linux)
**Project Type**: Monorepo workspace (pnpm)
**Performance Goals**: Quick fix execution < 2 seconds
**Constraints**: Labels file must remain valid JSON, preserve existing entries
**Scale/Scope**: Typical labels files < 1000 entries

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | ✅ | Extends existing code action pattern, no new abstractions |
| II. Comprehensive Testing | ✅ | Unit tests for generator, integration tests for code action |
| III. Type Safety with Effect | N/A | Feature uses Langium patterns, not Effect pipeline |
| IV. Clear Error Messages | ✅ | Error handling for file write failures with actionable messages |
| V. TDD | ✅ | Tests written first for label entry generator |
| VI. External Immutability | ✅ | Pure functions for label entry generation |
| VIII. Package Manager | ✅ | Using pnpm exclusively |
| XI. Code Quality with Biome | ✅ | Run `pnpm run check` after implementation |
| XIV. Windows Path Handling | ✅ | Use backslash paths in tool calls |
| XX. Testing Strategy | ✅ | Unit tests in `__tests__/` subdirectories |
| XXIII. vitest-mcp Tools | ✅ | Use `mcp__vitest__run_tests` for quality gates |
| XXV. Testing Guide | ✅ | Consult TESTING_GUIDE.md before writing tests |

## Project Structure

### Documentation (this feature)

```text
specs/041-label-entry-quickfix/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── language/
│   ├── src/
│   │   ├── eligian-code-action-provider.ts  # Extend with label entry quick fix
│   │   ├── labels/
│   │   │   ├── label-entry-generator.ts     # NEW: Generate label entry JSON
│   │   │   └── index.ts                     # Export new module
│   │   └── types/
│   │       └── code-actions.ts              # Add new types for label entry
│   └── src/__tests__/
│       └── label-entry-quickfix/            # NEW: Test directory
│           ├── label-entry-generator.spec.ts
│           └── code-action-integration.spec.ts
│
└── extension/
    └── src/extension/
        ├── main.ts                          # Register new command
        └── label-entry-creator.ts           # NEW: Handle file modification
```

**Structure Decision**: Extends existing packages/language and packages/extension structure. New functionality is added to existing modules following established patterns from Feature 039.

## Complexity Tracking

No violations to justify - feature follows existing patterns and stays within complexity bounds.
