# Implementation Plan: Validate Imported Actions in Operation Context

**Branch**: `024-validate-imported-actions` | **Date**: 2025-01-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-validate-imported-actions/spec.md`

## Summary

Fix validation bug where imported actions (from library files) are incorrectly flagged as "unknown operations" when called within action bodies. The validator currently checks local actions and library-defined actions, but does NOT check imported actions resolved via `import { foo } from "./lib.eligian"` statements. The fix requires extending the `checkOperationExists` validator to query the scope provider for imported action references before falling back to the operation registry.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Node.js 24.x)
**Primary Dependencies**: Langium 4.0.3 (LSP framework), Vitest 3.2.4 (testing)
**Storage**: N/A (validation logic only)
**Testing**: Vitest with existing test infrastructure (`createTestContext`, `parseAndValidate`)
**Target Platform**: VS Code extension + CLI compiler
**Project Type**: Monorepo (language package only)
**Performance Goals**: Validation should complete within existing LSP response times (<300ms for typical files)
**Constraints**: Must maintain 100% compatibility with existing operation validation (no regressions)
**Scale/Scope**: Single validator method modification + integration tests (minimal scope)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Simple fix - add import check before operation registry check (clear, well-documented)
- [x] **Comprehensive Testing**: Integration tests planned using existing test infrastructure
- [x] **No Gold-Plating**: Solves documented bug (imported actions don't validate). No speculative features.
- [x] **Code Review**: Standard PR process applies
- [x] **UX Consistency**: Fix maintains consistent validation behavior across IDE and CLI
- [x] **Functional Programming**: Validation logic is already pure (no state mutations)

*All checks pass - no complexity tracking needed.*

## Project Structure

### Documentation (this feature)

```
specs/024-validate-imported-actions/
├── plan.md              # This file
├── research.md          # Phase 0 output (scope provider API, import resolution)
├── data-model.md        # Phase 1 output (validation flow, import registry structure)
├── quickstart.md        # Phase 1 output (usage examples for testing)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (existing language package)

```
packages/language/src/
├── eligian-validator.ts          # MODIFY: checkOperationExists method (add import check)
├── eligian-scope-provider.ts     # READ: Existing import resolution methods
├── compiler/
│   └── name-resolver.ts          # READ: Helper for finding imported actions
└── __tests__/
    └── operation-validation.spec.ts  # MODIFY: Add imported action tests
```

**Structure Decision**: This is a **surgical fix** to the existing validator. No new modules needed - only modifying the `checkOperationExists` method in `eligian-validator.ts` and adding test cases to the existing `operation-validation.spec.ts` file.

## Complexity Tracking

*No violations - all Constitution checks pass.*

## Phase 0: Research & Investigation

**Goal**: Understand how import resolution currently works and why it's not being checked in validation.

### Research Tasks

1. **Scope Provider API Analysis**
   - Task: Analyze `EligianScopeProvider` to understand how imports are resolved
   - Files: `packages/language/src/eligian-scope-provider.ts`
   - Key methods: `getImportedActions`, `getScopeForActionImport`
   - Output: Document API for querying imported actions

2. **Name Resolver Integration**
   - Task: Understand how `findActionByName` works and if it checks imports
   - Files: `packages/language/src/compiler/name-resolver.ts`
   - Key methods: `findActionByName`, `buildNameRegistry`
   - Output: Document whether imports are included in name resolution

3. **Current Validation Flow**
   - Task: Trace validation flow in `checkOperationExists`
   - Files: `packages/language/src/eligian-validator.ts` lines 464-503
   - Current checks: (1) local actions, (2) library actions, (3) operations
   - Output: Document where import check should be inserted

4. **Import Statement Validation**
   - Task: Verify import validation already works (per spec assumptions)
   - Files: Check for existing import validation tests
   - Output: Confirm import resolution is working, only usage validation missing

**Deliverable**: `research.md` documenting:
- Scope provider API for querying imports
- Current validation flow with gaps identified
- Recommended insertion point for import check
- Test strategy for imported action validation

## Phase 1: Design Artifacts

**Prerequisites**: `research.md` complete

### Data Model

**Validation Flow** (updated):

```
checkOperationExists(operation) {
  1. Extract operation name
  2. Check if it's a LOCAL action (existing)
  3. Check if it's a LIBRARY action (existing)
  4. **NEW**: Check if it's an IMPORTED action
  5. If none of the above, check if it's a builtin operation
  6. If not found anywhere, report "unknown operation" error
}
```

**Import Registry Query**:

```typescript
// Query the scope provider for imported actions
function getImportedActions(program: Program): ActionDefinition[] {
  // Use existing scope provider API
  // Return list of all actions imported via import statements
}

function isImportedAction(name: string, program: Program): boolean {
  const importedActions = getImportedActions(program);
  return importedActions.some(action => action.name === name);
}
```

### API Contracts

No external APIs - this is internal validation logic.

### Quickstart Guide

**Testing Approach**:

```typescript
// Test Case 1: Valid imported action call
const { diagnostics } = await ctx.parseAndValidate(`
  import { fadeIn } from "./animations.eligian"

  action test() [
    fadeIn("#box", 1000)  // Should NOT error
  ]
`);

expect(diagnostics.filter(d => d.severity === 1)).toHaveLength(0);

// Test Case 2: Invalid operation (typo)
const { diagnostics } = await ctx.parseAndValidate(`
  import { fadeIn } from "./animations.eligian"

  action test() [
    fadein("#box", 1000)  // Typo - should error
  ]
`);

expect(diagnostics.filter(d => d.severity === 1)).toHaveLength(1);
expect(diagnostics[0].message).toContain('Unknown operation');
```

**Implementation Steps**:

1. Add helper method `getImportedActions(program)` to validator class
2. Modify `checkOperationExists` to call this helper before checking operations
3. Add test cases to `operation-validation.spec.ts`
4. Verify no regressions in existing tests

**Agent Context Update**: Run update script after Phase 1 complete.

## Phase 2: Implementation Tasks

**Command**: Run `/speckit.tasks` to generate granular task breakdown.

This will create `tasks.md` with specific implementation tasks including:

- Test-first development (write failing test)
- Modify `checkOperationExists` validator method
- Add import action query helper
- Verify all existing tests pass (regression check)
- Run code quality checks (Biome + typecheck)
- Update documentation if needed

## Success Criteria Verification

From spec.md:

- **SC-001**: Developers can use imported actions without false "unknown operation" errors
  - **Test**: Import and call action, verify zero validation errors

- **SC-002**: 100% of valid imported action calls pass validation
  - **Test**: Multiple import scenarios, all pass validation

- **SC-003**: Validator distinguishes between imported actions and invalid operations
  - **Test**: Mix valid imports with typos, only typos flagged

- **SC-004**: Code completion suggests imported actions within 500ms
  - **Test**: Existing completion tests should continue to work

- **SC-005**: Validation errors at import statements (not call sites) for non-existent actions
  - **Test**: Verify existing import validation behavior (already working per spec)

- **SC-006**: Existing operation validation tests pass without modification
  - **Test**: Run full test suite, verify zero regressions

## Notes

- **Minimal Scope**: This is a **bug fix**, not a feature addition. The import system already works - we're just fixing the validator.
- **Existing Infrastructure**: Scope provider already resolves imports. Validator just needs to query it.
- **Test Strategy**: Add 3-4 integration tests to `operation-validation.spec.ts` (imported action validation, typo detection, no imports case)
- **No New Dependencies**: Uses existing Langium infrastructure and test helpers
- **Performance**: No performance impact - import resolution already happens, we're just querying existing data
