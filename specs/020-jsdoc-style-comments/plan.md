# Implementation Plan: JSDoc-Style Documentation Comments for Custom Actions

**Branch**: `020-jsdoc-style-comments` | **Date**: 2025-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-jsdoc-style-comments/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add JSDoc-style documentation comments for Eligian custom actions, supporting:
1. **Parsing JSDoc comments** (`/** ... */`) with description and `@param` tags above action definitions
2. **Auto-generating JSDoc templates** when typing `/**` above actions (with type inference)
3. **Displaying documentation in hover tooltips** when hovering over action invocations

**Technical approach**: Extend Langium grammar to capture documentation comments as AST nodes, create a completion provider to generate JSDoc templates leveraging existing type inference, and enhance the hover provider to display documentation at action invocations.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Node.js ESM)
**Primary Dependencies**: Langium (language server), Vitest (testing), Biome (linting/formatting)
**Storage**: In-memory AST (no persistence needed)
**Testing**: Vitest with unit tests (parser, hover, completion) + integration tests (end-to-end IDE features)
**Target Platform**: VS Code Extension + Language Server
**Project Type**: Monorepo with multiple packages (`language`, `extension`, `cli`, `compiler`)
**Performance Goals**:
- JSDoc template generation: <500ms (per SC-002)
- Hover tooltip display: <300ms (per SC-005)
- Support 20+ parameters without degradation (per SC-007)

**Constraints**:
- Must preserve backward compatibility (undocumented actions continue working)
- Documentation comments are optional (not required for valid DSL)
- Must handle malformed JSDoc gracefully (no parser crashes per SC-008)

**Scale/Scope**:
- Target ~8-10 test files (6 unit + 2-4 integration)
- 4-5 new source files (parser, template generator, formatter, extractor, hover/completion extensions)
- Extend 2 existing files (grammar, module registration)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is clear - extend existing parser/hover/completion patterns. JSDoc is familiar to developers (industry standard). No unnecessary complexity.
- [x] **Comprehensive Testing**: Unit tests planned for parser, hover, and completion logic. Integration tests for end-to-end IDE behavior. Will follow Test-First Development (RED-GREEN-REFACTOR).
- [x] **No Gold-Plating**: Solves documented need (FR-001 to FR-018). Only implements core JSDoc features (description + `@param`). No speculative tags (`@returns`, `@throws`, etc.).
- [x] **Code Review**: Standard PR process applies (constitution compliance verified in review).
- [x] **UX Consistency**: Follows existing patterns (hover provider, completion provider). Consistent with how other IDE features work (CSS hover, operation completion).
- [x] **Functional Programming**: Parser utilities will be pure functions. Hover/completion providers extend existing Langium classes. External immutability maintained.
- [x] **Test-First Development**: Will write failing tests FIRST for each component (grammar parsing, template generation, hover display). No implementation before tests exist.
- [x] **Validation Pattern**: Documentation parsing logic will be in compiler package (pure functions), exposed to Langium validator as thin adapter.
- [x] **Biome + TypeScript**: Will run `npm run check && npm run typecheck` after each task completion.
- [x] **Research Standards**: Will use context7 MCP server for Langium API documentation (completion providers, hover providers, grammar extensions).
- [x] **Dependency Management**: No new dependencies required (uses existing Langium, Vitest, Biome).
- [x] **Accessibility**: Hover tooltips will render markdown (screen-reader friendly). Completion templates will be keyboard-accessible (standard VSCode behavior).

*All checks pass. No complexity justification needed.*

## Project Structure

### Documentation (this feature)

```
specs/020-jsdoc-style-comments/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/language/src/
├── eligian.langium                    # MODIFY: Add JSDoc comment grammar rule
├── eligian-module.ts                  # MODIFY: Register JSDoc completion provider
├── eligian-hover-provider.ts          # MODIFY: Add action documentation hover
├── eligian-completion-provider.ts     # MODIFY: Add JSDoc template completion
├── jsdoc/                             # NEW: JSDoc-specific logic
│   ├── jsdoc-parser.ts                # NEW: Parse JSDoc comments from AST
│   ├── jsdoc-template-generator.ts    # NEW: Generate JSDoc templates
│   └── __tests__/                     # NEW: Unit tests
│       ├── jsdoc-parser.spec.ts       # NEW: Test JSDoc parsing
│       └── jsdoc-template-generator.spec.ts  # NEW: Test template generation
├── __tests__/
│   ├── jsdoc-integration/             # NEW: Integration tests
│   │   ├── jsdoc-hover.spec.ts        # NEW: Test hover with JSDoc
│   │   └── jsdoc-completion.spec.ts   # NEW: Test JSDoc template completion
│   └── parsing.spec.ts                # MODIFY: Add JSDoc parsing tests
└── generated/
    └── ast.ts                          # REGENERATED: Langium-generated AST types

packages/compiler/src/
├── jsdoc/                              # NEW: Compiler-side JSDoc logic
│   ├── jsdoc-extractor.ts              # NEW: Extract JSDoc from AST (pure functions)
│   └── __tests__/                      # NEW: Unit tests
│       └── jsdoc-extractor.spec.ts     # NEW: Test JSDoc extraction
```

**Structure Decision**: Follows existing monorepo pattern. JSDoc logic split between:
- `packages/language/src/jsdoc/` - IDE-specific (hover, completion, parsing)
- `packages/compiler/src/jsdoc/` - Compiler-side (pure extraction functions)

This maintains the validation pattern (Principle X): compiler-first logic with Langium adapter.

## Complexity Tracking

*No constitutional violations. This section intentionally left empty.*
