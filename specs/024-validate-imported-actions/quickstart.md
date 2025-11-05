# Quickstart: Validate Imported Actions in Operation Context

**Date**: 2025-01-05
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Research**: [research.md](./research.md)
**Data Model**: [data-model.md](./data-model.md)

## Overview

This guide provides step-by-step instructions for implementing the imported action validation fix. Follow the test-first development approach outlined below.

---

## Prerequisites

Before starting implementation, ensure:

- ✅ All existing tests pass: `pnpm test` (1,565+ tests)
- ✅ Code is formatted: `pnpm run check`
- ✅ TypeScript compiles: `pnpm -w run typecheck`
- ✅ Research and data model artifacts complete (see links above)

---

## Implementation Steps

### Step 1: Make `getImportedActions` Public

**File**: `packages/language/src/eligian-scope-provider.ts`

**Location**: Line 129

**Change**:
```diff
  /**
-  * Private helper for Feature 023 US4: Also include imported actions from library files.
+  * Get all actions imported from library files (Feature 024).
+  * Used for validation and code completion.
   */
- private getImportedActions(program: any): ActionDefinition[] {
+ public getImportedActions(program: any): ActionDefinition[] {
    const importedActions: ActionDefinition[] = [];
```

**Rationale**: Validator needs to call this method to check imported actions.

**Verify**:
```bash
pnpm run typecheck
# Should pass - no errors
```

---

### Step 2: Add Import to Validator

**File**: `packages/language/src/eligian-validator.ts`

**Location**: Top of file (imports section)

**Add Import**:
```typescript
import type { EligianScopeProvider } from './eligian-scope-provider.js';
```

**Verify**:
```bash
pnpm run typecheck
# Should pass - import resolves
```

---

### Step 3: Write Failing Test (Test-First Development)

**File**: `packages/language/src/__tests__/operation-validation.spec.ts`

**Location**: End of file (after existing tests)

**Add Test Suite**:
```typescript
describe('Imported action validation', () => {
  test('should NOT error on valid imported action call', async () => {
    // Note: This test will FAIL initially (expected)
    // This proves the bug exists and we're fixing the right thing

    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./test.css"

      import { fadeIn } from "./animations.eligian"

      action test() [
        fadeIn("#app", 1000)
      ]

      timeline "Demo" in "#app" using raf {
        at 0s..1s test()
      }
    `);

    const errors = diagnostics.filter((d) => d.severity === 1);

    // Debug: show what errors we got
    if (errors.length > 0) {
      console.log('Errors found (expected to fail before fix):');
      for (const err of errors) {
        console.log(`  - ${err.message}`);
      }
    }

    // This will FAIL before fix (shows "Unknown operation: fadeIn")
    // Will PASS after fix (no errors)
    expect(errors).toHaveLength(0);
  });

  test('should error on typo in imported action name', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./test.css"

      import { fadeIn } from "./animations.eligian"

      action test() [
        fadein("#app", 1000)
      ]

      timeline "Demo" in "#app" using raf {
        at 0s..1s test()
      }
    `);

    const errors = diagnostics.filter((d) => d.severity === 1);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unknown operation');
    expect(errors[0].message).toContain('fadein');
  });

  test('should validate multiple imported actions', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./test.css"

      import { fadeIn, fadeOut } from "./animations.eligian"

      action sequence() [
        fadeIn("#app", 1000)
        fadeOut("#app", 500)
      ]

      timeline "Demo" in "#app" using raf {
        at 0s..1s sequence()
      }
    `);

    const errors = diagnostics.filter((d) => d.severity === 1);
    expect(errors).toHaveLength(0);
  });

  test('should validate mix of imported actions and builtin operations', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./test.css"

      import { fadeIn } from "./animations.eligian"

      action enhanced() [
        fadeIn("#app", 1000)
        selectElement("#app")
        addClass("visible")
      ]

      timeline "Demo" in "#app" using raf {
        at 0s..1s enhanced()
      }
    `);

    const errors = diagnostics.filter((d) => d.severity === 1);
    expect(errors).toHaveLength(0);
  });
});
```

**Run Test** (expect failure):
```bash
pnpm test operation-validation.spec.ts
# First test should FAIL with "Unknown operation: fadeIn" error
# This proves the bug exists
```

---

### Step 4: Modify Validator (Implement Fix)

**File**: `packages/language/src/eligian-validator.ts`

**Location**: Line 490 (after library action check, before operation check)

**Insert Code**:
```typescript
  checkOperationExists(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = getOperationCallName(operation);

    // T020: Skip operation validation if this is an action call
    // (Action calls are validated by checkTimelineOperationCall for direct timeline calls,
    //  or allowed in InlineEndableAction blocks)
    //
    // Feature 023: Also check for Library files
    const program = this.getProgram(operation);
    if (program) {
      const action = findActionByName(opName, program);
      if (action) {
        // This is a valid action call - skip operation validation
        return;
      }
    }

    // Feature 023: Check if operation is in a Library file
    const library = this.getLibrary(operation);
    if (library) {
      const action = library.actions?.find(a => a.name === opName);
      if (action) {
        // This is a valid action call within the library - skip operation validation
        return;
      }
    }

    // ✨ Feature 024: Check if operation is an IMPORTED action
    if (program) {
      const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
      const importedActions = scopeProvider.getImportedActions(program);
      const importedAction = findActionByName(opName, importedActions);
      if (importedAction) {
        // This is a valid imported action call - skip operation validation
        return;
      }
    }

    // Use compiler validation logic
    const error = validateOperationExists(opName);

    if (error) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: operation,
        property: 'operationName',
        code: error.code.toLowerCase(),
      });
    }
  }
```

**Code Explanation**:
- Line 490-496: NEW import check block
- Uses scope provider to get imported actions
- Reuses `findActionByName` helper (consistent with local action check)
- Returns early if action found (skips operation validation)
- Falls through to operation check if not found

---

### Step 5: Run Tests (Verify Fix)

**Run Test Suite**:
```bash
pnpm test operation-validation.spec.ts
```

**Expected Results**:
- ✅ All 4 new tests pass
- ✅ All existing tests still pass (no regressions)

**If Tests Fail**:
- Check import statement syntax
- Verify scope provider method is public
- Ensure `findActionByName` import exists
- Debug with console.log in validator

---

### Step 6: Run Full Test Suite (Regression Check)

**Run All Tests**:
```bash
pnpm test
```

**Expected**: All 1,569+ tests pass (4 new tests added)

**If Tests Fail**:
- Review failure messages
- Check if unrelated to this change
- Fix regressions before proceeding

---

### Step 7: Code Quality Checks

**Run Biome** (format + lint):
```bash
pnpm run check
```

**Expected**: 0 errors, 0 warnings

**If Issues Found**:
- Auto-fix: `pnpm run check --apply`
- Review changes
- Commit formatted code

**Run TypeScript**:
```bash
pnpm -w run typecheck
```

**Expected**: 0 errors

---

## Testing Scenarios

### Scenario 1: Valid Imported Action

**Input**:
```eligian
import { fadeIn } from "./animations.eligian"

action test() [
  fadeIn("#box", 1000)  // Should pass validation
]
```

**Expected**: ✅ Zero validation errors

**Before Fix**: ❌ "Unknown operation: fadeIn"
**After Fix**: ✅ No errors

---

### Scenario 2: Typo in Imported Action

**Input**:
```eligian
import { fadeIn } from "./animations.eligian"

action test() [
  fadein("#box", 1000)  // Typo: lowercase 'i'
]
```

**Expected**: ❌ "Unknown operation: fadein"

**Before Fix**: ❌ "Unknown operation: fadein" (correct error)
**After Fix**: ❌ "Unknown operation: fadein" (unchanged - still correct)

---

### Scenario 3: Multiple Imports

**Input**:
```eligian
import { fadeIn, fadeOut, slideIn } from "./animations.eligian"

action sequence() [
  fadeIn("#box", 1000)
  fadeOut("#box", 500)
  slideIn("#sidebar", 800)
]
```

**Expected**: ✅ Zero validation errors

**Before Fix**: ❌ 3 "Unknown operation" errors
**After Fix**: ✅ No errors

---

### Scenario 4: Mix of Imported Actions and Builtin Operations

**Input**:
```eligian
import { fadeIn } from "./animations.eligian"

action enhanced() [
  fadeIn("#box", 1000)         // Imported action
  selectElement("#box")        // Builtin operation
  addClass("visible")          // Builtin operation
]
```

**Expected**: ✅ Zero validation errors

**Before Fix**: ❌ "Unknown operation: fadeIn"
**After Fix**: ✅ No errors

---

### Scenario 5: No Imports (Regression Test)

**Input**:
```eligian
action test() [
  selectElement("#box")  // Builtin operation
  addClass("visible")    // Builtin operation
]
```

**Expected**: ✅ Zero validation errors (unchanged)

**Before Fix**: ✅ No errors
**After Fix**: ✅ No errors (no regression)

---

## Common Issues and Solutions

### Issue 1: Test Fails with "Library file not found"

**Symptom**: Test shows error about missing `./animations.eligian`

**Cause**: Test setup doesn't register library file in workspace

**Solution**: Use multi-file test setup (if needed):
```typescript
// Register library file
const libraryUri = 'file:///animations.eligian';
const libraryCode = `
  library animations
  action fadeIn(selector: string, duration: number) [
    selectElement(selector)
    animate({opacity: 1}, duration)
  ]
`;

// Parse library first
await ctx.services.shared.workspace.LangiumDocuments.getOrCreateDocument(
  URI.parse(libraryUri),
  libraryCode
);

// Then parse main file
const { diagnostics } = await ctx.parseAndValidate(`
  import { fadeIn } from "./animations.eligian"
  ...
`);
```

**Note**: Current test infrastructure may handle this automatically. If first test passes without this setup, it's not needed.

---

### Issue 2: TypeScript Error "Property 'getImportedActions' does not exist"

**Symptom**: TypeScript error when calling `scopeProvider.getImportedActions()`

**Cause**: Method is still private or import is missing

**Solution**:
1. Verify Step 1 complete (method is public)
2. Verify Step 2 complete (import added)
3. Rebuild: `pnpm run build`

---

### Issue 3: Test Still Fails After Fix

**Symptom**: First test still shows "Unknown operation: fadeIn" error

**Cause**: Validator code not inserted in correct location

**Solution**:
1. Verify import check is AFTER library check (line 489)
2. Verify import check is BEFORE operation check (line 492)
3. Check code matches exactly (including `if (program)` guard)

---

### Issue 4: Existing Tests Fail (Regression)

**Symptom**: Tests that previously passed now fail

**Cause**: Import check interferes with existing validation

**Solution**:
1. Verify import check has `if (program)` guard
2. Verify import check returns early (doesn't fall through)
3. Check error messages unchanged for non-import cases

---

## Performance Validation

### Measure Validation Time

**Before Fix**:
```bash
time pnpm test operation-validation.spec.ts
# Record baseline time
```

**After Fix**:
```bash
time pnpm test operation-validation.spec.ts
# Compare to baseline
```

**Expected**: <5% increase (negligible overhead)

**If Significant Slowdown**:
- Profile with `console.time()` around import check
- Verify scope provider caches imported actions
- Check if multiple calls to `getImportedActions` per validation

---

## Success Criteria Verification

From [spec.md](./spec.md):

### SC-001: Developers can use imported actions without false errors

**Test**: Scenario 1 (valid imported action call)
**Status**: ✅ Verified by test passing

### SC-002: 100% of valid imported action calls pass validation

**Test**: Scenarios 1, 3, 4 (multiple valid import cases)
**Status**: ✅ Verified by all tests passing

### SC-003: Validator distinguishes between imported actions and invalid operations

**Test**: Scenario 2 (typo still shows error)
**Status**: ✅ Verified by typo test

### SC-004: Code completion suggests imported actions within 500ms

**Test**: Existing completion tests (Feature 023 US4)
**Status**: ✅ Already working (no changes needed)

### SC-005: Validation errors at import statements for non-existent actions

**Test**: Import statement validation (separate concern)
**Status**: ✅ Already working (no changes needed)

### SC-006: Existing operation validation tests pass without modification

**Test**: Full test suite (Step 6)
**Status**: ✅ Verified by all 1,565+ existing tests passing

---

## Checklist

Before marking task complete, verify:

- [ ] Step 1: `getImportedActions` is public
- [ ] Step 2: Import added to validator
- [ ] Step 3: 4 new tests added
- [ ] Step 4: Validator code modified (9 lines added)
- [ ] Step 5: New tests pass
- [ ] Step 6: All existing tests pass (no regressions)
- [ ] Step 7: Biome check passes (0 errors, 0 warnings)
- [ ] Step 7: TypeScript compiles (0 errors)
- [ ] All 6 success criteria verified
- [ ] Performance impact <5% (negligible)
- [ ] Documentation updated (if needed)

---

## Next Steps

After completing implementation:

1. **Commit Changes**:
   ```bash
   git add packages/language/src/eligian-scope-provider.ts
   git add packages/language/src/eligian-validator.ts
   git add packages/language/src/__tests__/operation-validation.spec.ts
   git commit -m "Fix: Validate imported actions in operation context (Feature 024)

   - Make EligianScopeProvider.getImportedActions() public
   - Add import check to checkOperationExists validator
   - Add 4 integration tests for imported action validation
   - All tests pass (1,569 total, 4 new)
   - Zero regressions, zero performance impact

   Fixes: Imported actions incorrectly flagged as 'unknown operation'"
   ```

2. **Run CI Checks** (if applicable):
   ```bash
   pnpm -w run check   # Biome
   pnpm -w run build   # TypeScript
   pnpm test           # All tests
   ```

3. **Update Documentation** (if needed):
   - Add to CHANGELOG.md (if exists)
   - Update feature documentation (if needed)

4. **Create Pull Request** (if using PR workflow):
   - Reference spec: `specs/024-validate-imported-actions/spec.md`
   - Include test coverage evidence
   - Note zero regressions

---

## Additional Resources

- **Spec**: [spec.md](./spec.md) - Feature specification
- **Research**: [research.md](./research.md) - Technical analysis
- **Data Model**: [data-model.md](./data-model.md) - Validation flow diagram
- **Plan**: [plan.md](./plan.md) - Implementation plan

---

## Contact

For questions or issues during implementation:
- Review research.md Section 8 (Risks and Mitigations)
- Check data-model.md Section 10 (Alternative Approaches)
- Consult existing code: eligian-validator.ts lines 464-503

---

**Implementation Time Estimate**: 30-60 minutes (including testing)

**Complexity**: Low (9 lines of code, minimal risk)

**Test Coverage**: 4 new tests, 100% coverage of new code path
