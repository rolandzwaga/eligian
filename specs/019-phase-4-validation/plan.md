# Implementation Plan: Phase 4 - Validation Pipeline Unification

**Branch**: `019-phase-4-validation` | **Date**: 2025-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-phase-4-validation/spec.md`

## Summary

Fix validation inconsistencies between IDE and Compiler caused by CSS loading race conditions and singleton service state pollution. This feature synchronizes CSS file loading before validation in both environments, adds explicit state clearing to CSS registry between compilations, and introduces automated validation parity tests to prevent regressions. The solution eliminates "IDE shows errors but compilation succeeds" issues while also removing deprecated error type definitions left from Feature 018.

**Technical Approach**:
1. Unify CSS loading timing via proper async/await coordination in IDE path
2. Add `clearDocument()` and `clearAll()` state reset methods to CSSRegistryService
3. Create integration test suite comparing IDE vs compiler validation results
4. Remove deprecated `compiler/types/errors.ts` file and update all imports to unified error namespace

## Technical Context

**Language/Version**: TypeScript with NodeNext module resolution
**Primary Dependencies**: Langium 4.x, Vitest 3.2.4, @eligian/shared-utils, @eligian/language
**Storage**: N/A (in-memory CSS registry and document cache)
**Testing**: Vitest with 80% coverage threshold, 1235+ existing tests must pass
**Target Platform**: Node.js (CLI compiler) + VS Code Extension (IDE/LSP)
**Project Type**: Monorepo with language package (shared validation logic) and extension package (LSP server)
**Performance Goals**: Validation < 500ms for typical files, CSS loading < 2s (same as current baseline)
**Constraints**:
- Zero regressions (all 1235+ tests must pass)
- 100% validation parity between IDE and compiler (verified by automated tests)
- No breaking changes to error message formats
- Backwards compatibility with existing `.eligian` files

**Scale/Scope**:
- 4 user stories (P1-P4 priority)
- ~80 lines code removal (deprecated error types)
- 3-5 days implementation effort
- Affects 2 packages: `@eligian/language` and `@eligian/extension`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach fixes root cause (CSS loading timing) without adding complexity. State reset is explicit and well-documented.
- [x] **Comprehensive Testing**: Validation parity test suite ensures 100% behavioral consistency. Unit tests cover state isolation. All 1235+ existing tests continue passing.
- [x] **No Gold-Plating**: Solves real, documented user issue ("IDE shows errors but compilation succeeds"). No speculative features added.
- [x] **Code Review**: Standard PR review process applies. Parity tests provide objective verification.
- [x] **UX Consistency**: No UX changes - fixes inconsistency bug to restore expected behavior (IDE and CLI show same errors).
- [x] **Functional Programming**: Maintains external immutability. CSS registry uses internal mutation for performance (consistent with constitution principle VI). No Effect-ts usage required (existing Langium patterns sufficient).

*All checks pass. No complexity justification needed.*

## Project Structure

### Documentation (this feature)

```
specs/019-phase-4-validation/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file (implementation plan)
├── research.md          # Phase 0: Design decisions and research findings
├── data-model.md        # Phase 1: Entity definitions and state management
├── quickstart.md        # Phase 1: User and developer guide
├── contracts/           # Phase 1: API contracts
│   ├── validation-parity-api.md
│   └── css-registry-state-api.md
├── checklists/          # Quality validation
│   └── requirements.md  # Spec quality checklist (completed)
└── tasks.md             # Phase 2: Task breakdown (NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/
├── language/
│   ├── src/
│   │   ├── compiler/
│   │   │   ├── pipeline.ts              # FIX: CSS loading synchronization + singleton state reset
│   │   │   └── types/errors.ts          # DELETE: Deprecated error types (Feature 018 cleanup)
│   │   ├── errors/                      # EXISTING: Unified error namespace (Feature 018)
│   │   │   ├── base.ts
│   │   │   ├── compiler-errors.ts
│   │   │   ├── formatters.ts
│   │   │   └── index.ts
│   │   ├── css/
│   │   │   ├── css-registry.ts          # ENHANCE: Add clearDocument() and clearAll() methods
│   │   │   ├── css-service.ts           # EXISTING: CSS operations (Feature 017)
│   │   │   └── index.ts
│   │   └── __tests__/
│   │       ├── ide-compiler-parity.spec.ts  # NEW: Validation parity integration tests
│   │       └── css-state-isolation.spec.ts  # NEW: CSS registry state isolation tests
│   └── package.json
│
├── extension/
│   ├── src/
│   │   └── language/
│   │       └── main.ts                  # FIX: CSS loading synchronization with IDE validation
│   └── package.json
│
└── shared-utils/                        # EXISTING: File loading utilities (Feature 016)
    └── src/
        ├── file-loader.ts
        └── path-resolver.ts
```

**Structure Decision**: Use existing monorepo structure. Changes are localized to validation pipeline in `@eligian/language` (compiler + CSS registry) and `@eligian/extension` (LSP server). No new packages required - this is a refactoring/bugfix feature, not a new capability.

## Complexity Tracking

*No constitutional violations. All checks passed.*

This feature reduces complexity by:
1. Removing ~80 lines of deprecated code
2. Unifying validation behavior (eliminates special cases)
3. Adding explicit state management (clearer than implicit singleton behavior)

## Phase 0: Research Findings

See [research.md](./research.md) for detailed design decisions and alternatives considered.

**Key Decisions**:
1. **CSS Loading Synchronization**: Ensure CSS loads BEFORE validation in both IDE and compiler paths via async/await coordination
2. **Singleton State Management**: Add explicit state reset via `clearDocument()` and `clearAll()` methods on CSS registry
3. **Validation Parity Tests**: Integration test suite comparing IDE and compiler validation results using shared fixtures
4. **Deprecated Code Removal**: Delete `compiler/types/errors.ts`, update all imports to `errors/` namespace

## Phase 1: Design Artifacts

See detailed design documentation:
- [data-model.md](./data-model.md) - Entity definitions and state management model
- [quickstart.md](./quickstart.md) - User and developer guide
- [contracts/](./contracts/) - API contracts for validation parity and CSS registry state

**Core Entities**:
- **ValidationResult**: Normalized error/warning representation for comparison
- **CSSRegistryState**: Document-scoped CSS metadata with explicit state clearing
- **LangiumServiceInstance**: Shared services with documented stateful components

## Implementation Phases

### Phase 2: Foundation (US1 - CSS Loading Synchronization)

**Goal**: Fix CSS loading race condition (primary reported issue)

**Changes**:
1. **Compiler Path** (`packages/language/src/compiler/pipeline.ts:138-193`):
   - Move CSS loading to use same async pattern as IDE
   - Ensure CSS loads BEFORE validation via proper awaits
   - Add synchronization barrier before `validateDocument()` call

2. **IDE Path** (`packages/extension/src/language/main.ts:75-158`):
   - Ensure `onBuildPhase(DocumentState.Parsed)` completes before validation
   - Add await/synchronization to CSS loading workflow
   - Verify CSS metadata available before validation runs

3. **CSS Registry** (`packages/language/src/css/css-registry.ts`):
   - Add `clearDocument(documentUri: string): void` method
   - Add `clearAll(): void` method for full state reset
   - Document state management behavior in JSDoc

**Tests**:
- Unit tests for `clearDocument()` and `clearAll()` methods
- Integration test: CSS validation produces same errors in IDE and compiler
- Integration test: CSS changes reflect immediately in both environments

**Success Criteria**: CSS validation is 100% consistent between IDE and compiler

### Phase 3: State Isolation (US2 - Singleton State Reset)

**Goal**: Eliminate state pollution between compilations

**Changes**:
1. **Compiler Pipeline** (`packages/language/src/compiler/pipeline.ts:42-54`):
   - Add explicit state reset at start of `parseSource()`
   - Call `cssRegistry.clearDocument(uri)` before parsing
   - Document singleton state management in comments

2. **CSS Registry**:
   - Ensure `clearDocument()` removes all document-specific state
   - Verify no cross-document state leakage

**Tests**:
- Integration test: Compile fileA with CSS, then fileB without - fileB sees no CSS from fileA
- Integration test: Compile same file twice - both produce identical results
- Unit test: `clearDocument()` removes all document metadata

**Success Criteria**: Each compilation is fully isolated, deterministic results

### Phase 4: Validation Parity Assurance (US3 - Automated Tests)

**Goal**: Prevent future validation inconsistencies via automated testing

**Changes**:
1. **Parity Test Suite** (`packages/language/src/__tests__/ide-compiler-parity.spec.ts`):
   - Helper: `getIDEValidationErrors(source: string): Promise<ValidationResult[]>`
   - Helper: `getCompilerValidationErrors(source: string): Promise<ValidationResult[]>`
   - Helper: `compareValidationResults(ide, compiler): boolean`
   - Test cases: Parse errors, validation errors, CSS errors, asset errors

2. **Test Fixtures**:
   - Reuse existing fixtures from `__tests__/__fixtures__/`
   - Add CSS-specific fixtures for validation scenarios

**Tests**:
- 10+ test cases covering all validation scenarios
- Each test verifies IDE and compiler produce identical results

**Success Criteria**: 100% parity test pass rate, <10 second execution time

### Phase 5: Deprecated Code Removal (US4 - Technical Debt Cleanup)

**Goal**: Complete Feature 018 migration, enforce single source of truth

**Changes**:
1. **Delete File**:
   - Remove `packages/language/src/compiler/types/errors.ts` (262 lines)

2. **Update Imports** (~10 files):
   - `packages/language/src/compiler/pipeline.ts`
   - `packages/language/src/compiler/ast-transformer.ts`
   - Search for all imports from `compiler/types/errors`
   - Replace with imports from `@eligian/language/errors`

3. **Verify**:
   - Run `pnpm run typecheck` (all type errors resolved)
   - Run `pnpm test` (all tests pass)

**Tests**:
- Existing tests continue passing (no behavior change)
- TypeScript compilation succeeds

**Success Criteria**: Zero imports from deprecated location, all tests green

## Testing Strategy

### Unit Tests
- CSS registry state management (`clearDocument`, `clearAll`)
- CSS loading timing and synchronization
- Import path updates (verify no deprecated imports)

### Integration Tests
- **Validation Parity Suite** (`ide-compiler-parity.spec.ts`):
  - Parse errors identical in IDE and compiler
  - Validation errors identical in IDE and compiler
  - CSS validation errors identical in IDE and compiler
  - Asset loading errors identical in IDE and compiler

- **State Isolation Suite** (`css-state-isolation.spec.ts`):
  - Sequential compilations are independent
  - CSS metadata doesn't leak between files
  - Repeated compilation produces identical results

### Regression Tests
- All 1235+ existing tests must pass
- No performance degradation (<500ms validation, <2s CSS loading)
- CSS hot-reload continues working in IDE preview

## Risk Mitigation

### Risk 1: Breaking Existing Validation (Medium/High)
**Mitigation**:
- Add parity tests BEFORE making changes (TDD)
- Run full test suite after each change
- Test with real-world `.eligian` files from `examples/`

### Risk 2: Performance Degradation (Low/Medium)
**Mitigation**:
- Benchmark validation performance before/after
- Use async CSS loading with synchronization (not blocking)
- Add 2-second timeout for CSS loading

### Risk 3: Incomplete State Isolation (Medium/Medium)
**Mitigation**:
- Test sequential compilation scenarios explicitly
- Document all stateful components in Langium service
- Consider fresh service instance if performance allows

## Success Metrics

- **SC-001**: 100% validation parity (verified by parity tests) ✅
- **SC-002**: Zero "IDE shows errors but compilation succeeds" reports ✅
- **SC-003**: 80+ lines deprecated code removed ✅
- **SC-004**: Parity tests complete in <10 seconds ✅
- **SC-005**: No performance regression (<500ms validation) ✅
- **SC-006**: All 1235+ tests passing ✅
- **SC-007**: CSS hot-reload working (<300ms update) ✅

## Next Steps

1. ✅ **Spec Complete**: Feature specification written and validated
2. ✅ **Plan Complete**: Implementation plan with research and design (this document)
3. ⏳ **Generate Tasks**: Run `/speckit.tasks` to create task breakdown
4. ⏳ **Implementation**: Run `/speckit.implement` to execute tasks with TDD approach

**Estimated Timeline**: 3-5 days (P1-P2: 2 days, P3: 1 day, P4: 0.5 days, testing/polish: 0.5-1.5 days)
