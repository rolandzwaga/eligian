# Implementation Plan: Add continueForEach and breakForEach Operations

## Overview

**Feature**: Add support for `continueForEach` and `breakForEach` operations to the Eligian DSL compiler

**Version**: Eligius 1.3.0 introduces loop control flow operations (`breakForEach` and `continueForEach`) that provide early exit and skip functionality within `forEach` loops. These operations must be added to the Eligian operation registry so they can be used in Eligian DSL programs.

**Goal**: Update the operation registry generator to include the two new operations and regenerate `registry.generated.ts`.

---

## Technical Context

### Current State

- **Eligius Version**: 1.3.0 (upgraded in language package)
- **New Operations Available**: `breakForEach`, `continueForEach` (verified via metadata export)
- **Registry Generator**: `packages/language/src/compiler/operations/generate-registry.ts`
- **Registry Output**: `packages/language/src/compiler/operations/registry.generated.ts`
- **Current Operation Count**: 46 operations (before adding new ones)

### Architecture

The operation registry generator works by:
1. Importing all metadata functions from Eligius (`import { metadata } from 'eligius'`)
2. Mapping metadata function names to operation system names via `OPERATION_SYSTEM_NAMES`
3. Categorizing operations via `OPERATION_CATEGORIES` for documentation/IDE organization
4. Converting metadata to `OperationSignature` format via `convertMetadata()`
5. Generating TypeScript code with the complete registry

### New Operations (from Eligius 1.3.0)

**`breakForEach`**:
- **Category**: Control Flow
- **Purpose**: Exit a `forEach` loop early
- **Usage**: Must be used inside a `forEach`/`endForEach` block
- **DSL Syntax**: `breakForEach()` - direct operation call (no DSL sugar needed yet)

**`continueForEach`**:
- **Category**: Control Flow
- **Purpose**: Skip to next iteration of a `forEach` loop
- **Usage**: Must be used inside a `forEach`/`endForEach` block
- **DSL Syntax**: `continueForEach()` - direct operation call (no DSL sugar needed yet)

---

## Constitution Check

### Principle I: Simplicity, Documentation, and Maintainability ✅
- **Compliance**: This is a straightforward addition following existing patterns
- **Documentation**: Will add inline comments explaining the new operations

### Principle II: Comprehensive Testing (NON-NEGOTIABLE) ✅
- **Compliance**: Will add tests for registry inclusion and operation metadata
- **Plan**: Update registry tests to expect 48 operations (46 + 2 new)

### Principle III: No Gold-Plating ✅
- **Compliance**: Only adding operations that exist in Eligius - no speculative features
- **Rationale**: Users need these operations for loop control flow

### Principle XI: Code Quality - Biome Integration (NON-NEGOTIABLE) ✅
- **Compliance**: Will run `npm run check` after changes
- **Plan**: Ensure generated code is properly formatted

### Principle XIII: Operation Metadata Consultation (NON-NEGOTIABLE) ✅
- **Compliance**: Operations come directly from Eligius metadata - no assumptions
- **Verification**: Metadata functions confirmed to exist via import test

---

## Implementation Tasks

### Task 1: Update OPERATION_CATEGORIES mapping

**File**: `packages/language/src/compiler/operations/generate-registry.ts`

**Action**: Add new operations to Control Flow category

```typescript
// Line ~77-83 (Control Flow section)
const OPERATION_CATEGORIES: Record<string, string> = {
  // ... existing categories ...

  // Control Flow
  when: 'Control Flow',
  otherwise: 'Control Flow',
  endWhen: 'Control Flow',
  forEach: 'Control Flow',
  endForEach: 'Control Flow',
  continueForEach: 'Control Flow',  // NEW
  breakForEach: 'Control Flow',     // NEW

  // ... rest of categories ...
};
```

**Rationale**: These are control flow operations specifically for loop management, same category as `forEach`/`endForEach`.

---

### Task 2: Update OPERATION_SYSTEM_NAMES mapping

**File**: `packages/language/src/compiler/operations/generate-registry.ts`

**Action**: Add metadata function name → system name mappings

```typescript
// Line ~100-148 (alphabetically ordered)
const OPERATION_SYSTEM_NAMES: Record<string, string> = {
  addClass: 'addClass',
  // ... existing operations ...
  breakForEach: 'breakForEach',    // NEW (alphabetically after broadcastEvent)
  // ... existing operations ...
  continueForEach: 'continueForEach',  // NEW (alphabetically after createElement)
  // ... rest of operations ...
};
```

**Rationale**: Metadata function names match system names (both are camelCase), following existing convention.

---

### Task 3: Regenerate operation registry

**Command**: `npm run generate:registry` (from `packages/language` directory)

**Expected Changes**:
- `registry.generated.ts` will be updated with 48 operations (was 46)
- New entries for `breakForEach` and `continueForEach` with full metadata
- Generated timestamp will be updated
- Summary will show updated count

**Verification**:
```bash
# Check operation count
grep -c '"systemName":' packages/language/src/compiler/operations/registry.generated.ts
# Should output: 48

# Verify new operations exist
grep -E '(breakForEach|continueForEach)' packages/language/src/compiler/operations/registry.generated.ts
# Should show entries for both operations
```

---

### Task 4: Update registry tests

**File**: `packages/language/src/compiler/operations/__tests__/registry.spec.ts`

**Action**: Update expected operation count and add specific tests for new operations

```typescript
// Update count expectation (was 46)
test('registry contains expected number of operations', () => {
  const count = Object.keys(OPERATION_REGISTRY).length;
  expect(count).toBe(48); // Updated from 46
});

// Add new test case
test('registry includes loop control operations', () => {
  expect(OPERATION_REGISTRY).toHaveProperty('breakForEach');
  expect(OPERATION_REGISTRY).toHaveProperty('continueForEach');

  const breakForEach = OPERATION_REGISTRY.breakForEach;
  const continueForEach = OPERATION_REGISTRY.continueForEach;

  // Verify category
  expect(breakForEach.category).toBe('Control Flow');
  expect(continueForEach.category).toBe('Control Flow');

  // Verify they have metadata
  expect(breakForEach.parameters).toBeDefined();
  expect(continueForEach.parameters).toBeDefined();
});
```

**Rationale**: Tests verify the registry generation was successful and operations are properly categorized.

---

### Task 5: Run Biome checks

**Command**: `npm run check` (from project root or `packages/language`)

**Expected**: 0 errors, 0 warnings

**Action**: Fix any formatting or linting issues surfaced by Biome

---

### Task 6: Run test suite

**Command**: `npm run test` (from `packages/language`)

**Expected**: All tests pass (should be ~300 tests including 2 new registry tests)

**Verification Checklist**:
- [ ] Registry tests pass (48 operations expected)
- [ ] New operation tests pass
- [ ] No regressions in existing tests
- [ ] Build succeeds

---

## Validation Plan

### Manual Validation

**Test DSL Program** (`examples/loop-control-test.eligian`):
```eligian
action testLoopControl(items) [
  for (item in items) {
    // Skip items that match condition
    if (@@item == "skip") {
      continueForEach()
    }

    // Exit early if condition met
    if (@@item == "exit") {
      breakForEach()
    }

    log(@@item)
  }
]

timeline "test" using raf {
  at 0s..1s { testLoopControl(["a", "skip", "b", "exit", "c"]) }
}
```

**Expected Behavior**:
- DSL should parse without errors
- Operations should be recognized (no "unknown operation" errors)
- Compilation should succeed
- Generated JSON should include `breakForEach` and `continueForEach` operation configs

**Validation Steps**:
1. Create test file with loop control operations
2. Run CLI compiler: `node packages/cli/bin/cli.js examples/loop-control-test.eligian`
3. Verify compilation succeeds
4. Check generated JSON contains operations with correct `systemName`

---

## Risk Assessment

### Low Risk ✅
- **Adding to existing registry**: Follows well-established pattern
- **Operations exist in Eligius**: Verified via metadata import
- **No breaking changes**: Purely additive change

### Potential Issues
1. **Metadata format changes**: If Eligius 1.3.0 changed metadata structure
   - **Mitigation**: Test registry generation, verify metadata-converter handles new format

2. **Operation dependencies**: If operations have special dependency requirements
   - **Mitigation**: Metadata converter should handle this automatically

3. **Category organization**: Ensure "Control Flow" category is appropriate
   - **Mitigation**: Matches existing `forEach`/`endForEach` category

---

## Success Criteria

- [ ] `breakForEach` added to `OPERATION_CATEGORIES` (Control Flow)
- [ ] `continueForEach` added to `OPERATION_CATEGORIES` (Control Flow)
- [ ] `breakForEach` added to `OPERATION_SYSTEM_NAMES`
- [ ] `continueForEach` added to `OPERATION_SYSTEM_NAMES`
- [ ] Registry regenerated successfully (48 operations)
- [ ] Registry tests updated and passing
- [ ] Biome checks pass (0 errors, 0 warnings)
- [ ] Full test suite passes (~300 tests)
- [ ] Manual DSL validation succeeds

---

## Timeline Estimate

**Total Time**: ~30 minutes

- Task 1 (OPERATION_CATEGORIES): 5 minutes
- Task 2 (OPERATION_SYSTEM_NAMES): 5 minutes
- Task 3 (Regenerate registry): 2 minutes
- Task 4 (Update tests): 10 minutes
- Task 5 (Biome checks): 2 minutes
- Task 6 (Run tests): 5 minutes
- Manual validation: 5 minutes

---

## Notes

### DSL Syntax Consideration (Future Work)

Currently, users will call these operations directly:
```eligian
for (item in items) {
  if (condition) {
    breakForEach()
  }
}
```

**Future Enhancement** (not in this plan): Add syntactic sugar for `break` and `continue` keywords:
```eligian
for (item in items) {
  if (condition) {
    break  // Compiles to breakForEach()
  }
  if (otherCondition) {
    continue  // Compiles to continueForEach()
  }
}
```

This would require:
- Grammar changes (add `break` and `continue` keywords)
- Transformer changes (compile to operation calls)
- Validation (ensure only used inside loops)
- Tests for syntax sugar

**Decision**: Defer syntax sugar to Phase 19+ (deferred features). Current direct operation call approach is sufficient and follows existing patterns.

---

## Post-Implementation

### Documentation Updates

**File**: `CLAUDE.md`
- Update operation count: "46 operations" → "48 operations"
- Note addition of loop control operations in relevant sections

### Phase Tracking

**File**: `specs/main/tasks.md`
- Add task entry for registry update (if tracked)
- Update current status with operation count

### Commit Message

```
feat(registry): add breakForEach and continueForEach operations

- Added continueForEach and breakForEach to OPERATION_CATEGORIES (Control Flow)
- Added metadata function mappings in OPERATION_SYSTEM_NAMES
- Regenerated registry.generated.ts with 48 operations (was 46)
- Updated registry tests to expect new operation count
- All tests passing, Biome checks clean

Eligius 1.3.0 introduces loop control flow operations for early exit
and skip functionality within forEach loops. These operations are now
available in Eligian DSL programs.

Refs: Eligius 1.3.0 upgrade
```

---

**Plan Version**: 1.0
**Created**: 2025-10-18
**Feature**: Loop Control Operations (breakForEach, continueForEach)
**Estimated Effort**: 30 minutes
**Complexity**: Low (straightforward additive change)
