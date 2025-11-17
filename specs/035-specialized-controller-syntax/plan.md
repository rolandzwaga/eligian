# Implementation Plan: Specialized Controller Syntax

**Branch**: `035-specialized-controller-syntax` | **Date**: 2025-11-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-specialized-controller-syntax/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement specialized `addController` syntax for ALL Eligius controllers (8 total) with compile-time parameter validation based on controller metadata. The syntax `addController('LabelController', "mainTitle")` replaces verbose 2-operation sequences with a single, validated call. Controller metadata is generated from Eligius ctrlmetadata at build time, reusing the proven pattern from metadata/eventmetadata processing. Label ID parameters receive specialized validation via Feature 034 infrastructure with Levenshtein suggestions. The feature compiles to equivalent Eligius JSON (getControllerInstance + addControllerToElement) with backwards compatibility for existing operation-based syntax.

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js ESM (NodeNext module resolution)
**Primary Dependencies**: Langium 3.x (parser/validator), Eligius npm package (ctrlmetadata source), Feature 034 (LabelRegistryService)
**Storage**: N/A (compile-time only, no runtime storage)
**Testing**: Vitest (unit + integration), test-first development (RED-GREEN-REFACTOR)
**Target Platform**: VS Code Extension (Language Server Protocol), CLI compiler
**Project Type**: Langium-based DSL compiler/validator (single monorepo with packages)
**Performance Goals**: <300ms IDE autocomplete response (SC-005), <10ms validation per addController call, <500ms metadata generation at build time
**Constraints**: 100% compile-time validation (SC-002, SC-003, SC-007), backwards compatibility required (FR-012, SC-006), Levenshtein suggestions threshold ≤2
**Scale/Scope**: 8 Eligius controllers, ~10-20 parameters total, generates ~2KB metadata file, supports unlimited addController calls per program

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md` (v2.3.0):

- [x] **Principle I - Simplicity & Documentation**: Approach is clear - reuses proven metadata generation pattern, extends existing validators/transformers. Research.md, data-model.md, contracts/, and quickstart.md provide comprehensive documentation. No unnecessary complexity - leverages existing infrastructure.

- [x] **Principle II - Comprehensive Testing**: Test-first development planned (RED-GREEN-REFACTOR). Unit tests for: metadata generation, validation (5 error types), transformation (parameter mapping), Levenshtein suggestions. Integration tests for: end-to-end compilation, IDE support (P3). Target: 80%+ coverage.

- [x] **Principle III - No Gold-Plating**: Solves documented user pain point - verbose 2-operation controller syntax. User explicitly requested this feature. All 8 controllers supported (per corrected spec - no phased rollout). P3 (IDE support) is genuine enhancement, not speculative.

- [x] **Principle IV - Code Review**: Standard git workflow applies - feature branch `035-specialized-controller-syntax`, PR review before merge, Biome formatting enforced (`pnpm run check`).

- [x] **Principle V - UX Consistency**: Extends existing Eligian DSL syntax patterns (similar to existing operation calls). IDE support (P3) uses standard LSP CompletionProvider/HoverProvider interfaces. Error messages follow existing validation pattern (code + message + suggestions).

- [x] **Principle VI - Functional Programming**: External immutability maintained - all validators/transformers are pure functions. No Effect-ts needed (language package uses Langium services, not Effect runtime). Internal mutation allowed for performance (array building in metadata generation).

- [x] **Principle IX - ESM Import Extensions**: All imports use `.js` extensions (TypeScript ESM with NodeNext). Contract files use `.js` imports for generated AST types.

- [x] **Principle X - Validation Pattern**: Compiler-first validation in `eligian-validator.ts` with Langium ValidationAcceptor. LSP integration automatic via Langium. No manual diagnostic management.

- [x] **Principle XI - Biome Formatting**: All code must pass `pnpm run check` before task completion. Contract files follow Biome rules.

- [x] **Principle XV - Operation Metadata Consultation**: Uses Eligius ctrlmetadata as source of truth (imported from `eligius` npm package). Metadata generated at build time via `generate-metadata.ts` script.

- [x] **Principle XXV - Testing Guide Consultation**: Will use `createTestContext()`, `setupCSSRegistry()` (if needed), `DiagnosticSeverity` enum, and follow `beforeAll()`/`beforeEach()` patterns from test-helpers.ts.

- [x] **Principle XXVI - Technical Overview Consultation**: Consulted CLAUDE.md sections on: Langium architecture, existing metadata processing (eventmetadata pattern), validation patterns, test strategy, Biome requirements.

**Result**: ✅ All checks pass. No violations to justify. Proceeding with implementation.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/
├── language/                           # Langium language package (published as @eligian/language)
│   ├── src/
│   │   ├── completion/
│   │   │   ├── generate-metadata.ts    # [MODIFIED] Add ctrlmetadata generation
│   │   │   └── metadata/
│   │   │       └── controllers.generated.ts  # [NEW] Generated controller metadata
│   │   ├── eligian-validator.ts        # [MODIFIED] Add controller validation
│   │   ├── eligian-completion-provider.ts  # [MODIFIED P3] Add controller autocomplete
│   │   ├── eligian-hover-provider.ts   # [MODIFIED P3] Add controller hover docs
│   │   └── __tests__/
│   │       ├── controller-validation.spec.ts  # [NEW] Controller validation tests
│   │       └── controller-transformation.spec.ts  # [NEW] Transformation tests
│   └── package.json
│
├── compiler/                           # Compiler package
│   ├── src/
│   │   └── ast-transformer.ts          # [MODIFIED] Add controller transformation logic
│   └── __tests__/
│       └── controller-compiler.spec.ts # [NEW] End-to-end compilation tests
│
├── cli/                                # CLI compiler
│   └── src/
│       └── main.ts                     # [UNCHANGED] Uses compiler package
│
└── extension/                          # VS Code extension
    └── src/
        └── language/
            └── main.ts                 # [UNCHANGED] Uses language package

specs/035-specialized-controller-syntax/ # This feature's documentation
├── spec.md                             # Feature specification
├── plan.md                             # This file
├── research.md                         # Phase 0 research findings
├── data-model.md                       # Phase 1 data model
├── quickstart.md                       # Phase 1 usage guide
├── contracts/                          # Phase 1 API contracts
│   ├── controller-validator.contract.ts
│   ├── metadata-generator.contract.ts
│   ├── controller-transformer.contract.ts
│   ├── controller-completion.contract.ts
│   └── controller-hover.contract.ts
└── checklists/
    └── requirements.md                 # Spec validation checklist
```

**Structure Decision**: This is a Langium-based DSL project organized as a monorepo with multiple packages. The feature primarily modifies the **language package** (validation, completion, hover) and **compiler package** (AST transformation). No new packages are created - we extend existing infrastructure. The grammar file (`eligian.langium`) requires NO changes as existing `OperationCall` grammar handles variable arguments. All changes are additive (new files) or extensions (adding methods to existing validators/transformers).

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
