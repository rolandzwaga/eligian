# Implementation Plan: Import Resolution Failures in Multi-File Test Scenarios

**Branch**: `026-investigation-and-fix` | **Date**: 2025-11-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/026-investigation-and-fix/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Investigation and fix for test infrastructure issue where `setupDocuments()` helper fails to resolve imported actions across files, while `createLibraryDocument()` succeeds. The problem manifests as "Unknown action: fadeIn" errors when library files define actions that main files import and call. Root cause analysis will identify differences in document registration, workspace state, and validation timing between the two helpers. Fix will enable `setupDocuments()` to correctly resolve cross-file imports, allowing 3 currently-skipped tests to pass. Comprehensive test environment documentation will prevent future developers from encountering the same issues.

## Technical Context

**Language/Version**: TypeScript with Node.js 19+ (project uses ESM, NodeNext module resolution)
**Primary Dependencies**: Langium (language server framework), Vitest (testing framework), Langium/test utilities (parseHelper, validationHelper)
**Storage**: N/A (test infrastructure only - uses in-memory mock file system for multi-file tests)
**Testing**: Vitest with Langium test utilities - issue affects test helper functions in `test-helpers.ts`
**Target Platform**: Node.js test environment (developer workstations and CI/CD)
**Project Type**: Single monorepo with pnpm workspaces (`packages/language` contains test infrastructure)
**Performance Goals**: Test execution time unchanged (fix should not impact test performance)
**Constraints**: Must maintain 100% backward compatibility with existing 1483+ tests, zero regressions allowed
**Scale/Scope**: Affects 3 currently-skipped tests in `operation-validation.spec.ts`, enables future multi-file integration tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Investigation-first approach is clear. Will document findings in research.md and comprehensive test environment guide. Fix will be minimal changes to test-helpers.ts.
- [x] **Comprehensive Testing**: Existing tests validate the fix (3 skipped tests will be un-skipped). Regression validation via full test suite (1483+ tests). No new production code, so no new test requirements beyond validation.
- [x] **No Gold-Plating**: Solves documented problem (3 failing tests, developer confusion). Scope explicitly limited to test infrastructure fix, no production code changes.
- [x] **Code Review**: Standard PR process applies after fix implementation.
- [x] **UX Consistency**: N/A - internal test infrastructure, not user-facing.
- [x] **Functional Programming**: Test helpers are utility functions - no Effect-ts needed. Will maintain pure function signatures where applicable.
- [x] **Test-First Development**: Tests already exist (3 skipped tests) - they will validate the fix when un-skipped.
- [x] **Debugging Attempt Limit**: Investigation structured to avoid infinite debugging - root cause analysis first, then targeted fix.
- [x] **ESM Import Extensions**: All changes will use .js extensions for relative imports.
- [x] **Biome Integration**: Will run pnpm run check after changes.
- [x] **Incremental Commits**: Will commit after each phase (research, fix, documentation).

*All checks pass - no complexity justification needed.*

## Project Structure

### Documentation (this feature)

```
specs/026-investigation-and-fix/
├── spec.md              # Feature specification (already created)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0: Root cause investigation findings
├── quickstart.md        # Phase 1: Test environment guide (comprehensive documentation)
├── checklists/
│   └── requirements.md  # Spec quality validation (already created)
└── tasks.md             # NOT created by /speckit.plan - created by /speckit.tasks
```

**Note**: This is a test infrastructure fix, not a typical feature. Phase 1 outputs are adapted:
- `data-model.md` is NOT applicable (no data entities)
- `contracts/` is NOT applicable (no API contracts)
- `quickstart.md` serves as the comprehensive test environment guide (per spec FR-011)

### Source Code (repository root)

```
packages/language/
└── src/
    └── __tests__/
        ├── test-helpers.ts          # FIX TARGET: setupDocuments() and createLibraryDocument()
        ├── operation-validation.spec.ts  # 3 skipped tests will be un-skipped after fix
        ├── import-validation.spec.ts     # 16 passing tests - regression validation
        └── multi-file-helpers/
            ├── setup-documents.spec.ts       # Tests for setupDocuments() helper
            └── create-library-documents.spec.ts  # Tests for createLibraryDocument() helper
```

**Additional Documentation Output**:
```
specs/
└── test-environment-guide.md    # Comprehensive guide (2000+ words) - output from Phase 1
```

**Structure Decision**:

This is a test infrastructure investigation and fix, not a new feature implementation. Changes will be confined to:
1. `packages/language/src/__tests__/test-helpers.ts` - Fix `setupDocuments()` helper
2. `packages/language/src/__tests__/operation-validation.spec.ts` - Un-skip 3 tests after fix
3. `specs/test-environment-guide.md` - Create comprehensive documentation

No production code changes. No new source files. Minimal surface area for regression risk.

## Complexity Tracking

*No constitutional violations - this section intentionally left empty.*
