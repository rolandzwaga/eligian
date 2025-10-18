# Implementation Plan: Fix Test Failures After Eligius 1.3.0 Upgrade

## Overview

**Issue**: After upgrading to Eligius 1.3.0 and adding `breakForEach`/`continueForEach` operations to the registry, 3 tests are failing in the language package test suite.

**Affected Tests**:
1. `validation.spec.ts` - "should accept operation calls with arguments" (1 validation error)
2. `validation.spec.ts` - "should validate complex valid program" (2 validation errors)
3. `transformer.spec.ts` - "should transform stagger block with inline operations" (Undefined variable reference error)

**Goal**: Investigate root causes and fix all failing tests while maintaining backward compatibility and registry integrity.

---

## Technical Context

### Current State

- **Eligius Version**: 1.3.0 (upgraded from earlier version)
- **Registry Operations**: 48 operations (46 + 2 new: breakForEach, continueForEach)
- **Registry Tests**: ✅ All 24 passing
- **Language Tests**: ❌ 3 failing (297 passing, 8 skipped)
- **Recent Changes**: Added loop control operations to OPERATION_REGISTRY

### Test Failure Patterns

**Pattern 1: Validation Errors** (2 tests)
- Tests expect 0 validation errors, but getting 1-2 errors
- Likely related to operation validation or parameter validation
- May be caused by changes in Eligius 1.3.0 metadata structure
- Could be related to new operations being detected unexpectedly

**Pattern 2: Transform Error** (1 test)
- "Undefined variable reference (linking failed)"
- Location: line 4, column 39
- Stagger syntax test (T192)
- Could be related to variable scoping or reference resolution

### Hypothesis

The Eligius 1.3.0 upgrade may have:
1. Changed operation metadata structure (parameters, dependencies, outputs)
2. Changed validation behavior for certain operations
3. Changed variable reference resolution in stagger blocks
4. Introduced stricter validation rules

---

## Constitution Check

### Principle II: Comprehensive Testing (NON-NEGOTIABLE) ✅
- **Compliance**: Fixing failing tests is critical before proceeding
- **Rationale**: "All tests MUST pass before moving on after refactoring"
- **Action**: Must investigate and fix all 3 failing tests

### Principle I: Simplicity, Documentation, and Maintainability ✅
- **Compliance**: Investigation must be systematic and documented
- **Documentation**: Root cause analysis will be documented in plan

### Principle III: No Gold-Plating ✅
- **Compliance**: Fix only what's broken, no unnecessary changes
- **Approach**: Targeted fixes for specific test failures

### Principle XIII: Operation Metadata Consultation (NON-NEGOTIABLE) ✅
- **Compliance**: Check if Eligius 1.3.0 changed operation metadata
- **Verification**: Compare metadata before/after upgrade if needed

---

## Investigation Tasks

### Phase 0: Reproduce and Analyze Failures

**Task 0.1: Run failing tests individually with detailed output**

```bash
# Run validation tests with full output
npm run test -- validation.spec.ts --reporter=verbose

# Run transformer test with full output
npm run test -- transformer.spec.ts --reporter=verbose
```

**Expected Output**:
- Exact validation error messages
- Which operations are causing validation failures
- Line numbers and code context for transform error

---

**Task 0.2: Examine test code for validation failures**

**File**: `packages/language/src/__tests__/validation.spec.ts`

**Actions**:
1. Read test "should accept operation calls with arguments" (around line 259)
2. Read test "should validate complex valid program" (around line 319)
3. Identify which operations are being tested
4. Check if test DSL code uses any deprecated syntax

**Questions to Answer**:
- What operations are being called in the test DSL?
- Are breakForEach/continueForEach being invoked unexpectedly?
- Are there parameter validation changes in Eligius 1.3.0?

---

**Task 0.3: Examine transformer test failure**

**File**: `packages/language/src/compiler/__tests__/transformer.spec.ts`

**Actions**:
1. Read test "should transform stagger block with inline operations" (T192)
2. Check the DSL input at line 4, column 39
3. Identify the undefined variable reference
4. Check stagger block variable scoping logic

**Questions to Answer**:
- What variable is being referenced?
- Is this a stagger-specific scoping issue?
- Did Eligius 1.3.0 change variable resolution rules?

---

### Phase 1: Root Cause Analysis

**Task 1.1: Check for Eligius 1.3.0 metadata changes**

**Actions**:
1. Check if any existing operations had metadata changes in 1.3.0
2. Verify parameter types, dependencies, outputs for all operations
3. Compare against test expectations

**Command**:
```bash
# Check metadata for operations used in failing tests
node -e "import('eligius').then(m => {
  console.log('addClass:', JSON.stringify(m.metadata.addClass(), null, 2));
  console.log('forEach:', JSON.stringify(m.metadata.forEach(), null, 2));
  // Add other operations as needed
})"
```

---

**Task 1.2: Check validation logic changes**

**File**: `packages/language/src/eligian-validator.ts`

**Actions**:
1. Review validation rules that could be triggered unexpectedly
2. Check if loop control operation validation is too broad
3. Verify parameter validation logic hasn't regressed

**Focus Areas**:
- Operation existence validation
- Parameter count/type validation
- Control flow validation (especially for forEach)
- Variable reference validation

---

**Task 1.3: Check transformer variable resolution**

**File**: `packages/language/src/compiler/ast-transformer.ts`

**Actions**:
1. Review stagger block transformation logic
2. Check variable scope management in stagger contexts
3. Verify cross-reference resolution for variables

**Focus Areas**:
- Stagger block variable scoping (lines related to T192)
- Variable reference linking
- Expression transformation in stagger contexts

---

### Phase 2: Fix Implementation

Based on root cause analysis, implement targeted fixes:

**Scenario A: Validation Logic Issue**

If validation is incorrectly flagging valid code:

**Task 2A.1**: Update validation rules
- Fix overly strict validation
- Ensure loop control operations only validate inside loops
- Update parameter validation if Eligius 1.3.0 changed types

**Task 2A.2**: Update test expectations (only if valid)
- If Eligius 1.3.0 intentionally made validation stricter
- Update test DSL to comply with new rules
- Document breaking changes

---

**Scenario B: Transformer/Variable Resolution Issue**

If transformer can't resolve variable references:

**Task 2B.1**: Fix stagger variable scoping
- Ensure variables in stagger blocks are properly scoped
- Fix cross-reference resolution
- Update transformer to handle new Eligius patterns

**Task 2B.2**: Update stagger tests
- Verify stagger syntax is still correct
- Update test DSL if syntax changed
- Add regression tests

---

**Scenario C: Registry/Metadata Issue**

If registry has incorrect metadata:

**Task 2C.1**: Fix metadata conversion
- Check metadata-converter.ts for issues
- Verify parameter types are correctly mapped
- Regenerate registry if needed

**Task 2C.2**: Update operation signatures
- Fix any incorrect parameter definitions
- Update dependencies/outputs if changed
- Re-run registry generation

---

### Phase 3: Validation & Testing

**Task 3.1: Run specific failing tests**

```bash
# Validate fixes
npm run test -- validation.spec.ts
npm run test -- transformer.spec.ts
```

**Expected**: All tests pass

---

**Task 3.2: Run full test suite**

```bash
npm run test
```

**Expected**: 300 tests passing, 8 skipped (no failures)

---

**Task 3.3: Run Biome checks**

```bash
npm run check
```

**Expected**: 0 errors, 0 warnings

---

**Task 3.4: Verify registry integrity**

```bash
# Ensure registry still has 48 operations
npm run test -- registry.spec.ts
```

**Expected**: All 24 registry tests passing

---

## Success Criteria

- [x] All 3 failing tests are fixed and passing
- [x] Full test suite shows 300 tests passing (no failures)
- [x] Registry integrity maintained (48 operations, all tests pass)
- [x] Biome checks pass (0 errors, 0 warnings)
- [x] Root cause documented in plan
- [x] Fix approach documented for future reference
- [x] No regressions introduced

---

## Risk Assessment

### Low Risk ✅
- Registry changes isolated from validation/transformer logic
- Test failures appear pre-existing (not introduced by registry changes)
- Fixes will be targeted and minimal

### Potential Issues

1. **Breaking changes in Eligius 1.3.0**
   - **Risk**: Metadata structure changed in incompatible way
   - **Mitigation**: Check Eligius changelog, adapt metadata-converter if needed

2. **Test expectations outdated**
   - **Risk**: Tests expect old behavior that Eligius 1.3.0 changed
   - **Mitigation**: Verify changes are intentional before updating tests

3. **Hidden dependencies**
   - **Risk**: Fixes in one area break other tests
   - **Mitigation**: Run full test suite after each fix

---

## Timeline Estimate

**Total Time**: 1-2 hours

- Phase 0 (Investigation): 30-45 minutes
  - Task 0.1: 10 minutes (run tests, collect output)
  - Task 0.2: 10 minutes (read validation tests)
  - Task 0.3: 10-15 minutes (read transformer test)

- Phase 1 (Root Cause): 15-30 minutes
  - Task 1.1: 10 minutes (check metadata)
  - Task 1.2: 5-10 minutes (review validation)
  - Task 1.3: 5-10 minutes (review transformer)

- Phase 2 (Fix): 15-30 minutes (depends on root cause)
  - Single scenario: 15-20 minutes
  - Multiple scenarios: 25-30 minutes

- Phase 3 (Validation): 10-15 minutes
  - Test runs: 10 minutes
  - Verification: 5 minutes

---

## Notes

### Pre-Investigation Context

**Test Failure Summary** (from initial run):
```
Test Files: 2 failed | 10 passed (12)
Tests: 3 failed | 297 passed | 8 skipped (308)
Duration: 2.76s
```

**Failing Tests**:
1. `validation.spec.ts:259` - "should accept operation calls with arguments"
   - Expected: 0 validation errors
   - Actual: 1 validation error

2. `validation.spec.ts:319` - "should validate complex valid program"
   - Expected: 0 validation errors
   - Actual: 2 validation errors

3. `transformer.spec.ts` - "should transform stagger block with inline operations"
   - Error: `{"_tag":"TransformError","kind":"InvalidExpression","message":"Undefined variable reference (linking failed)","location":{"line":4,"column":39,"length":null}}`

### Investigation Strategy

1. **Start with validation tests** - Two related failures suggest common root cause
2. **Check transformer separately** - Different error pattern, likely different cause
3. **Verify registry operations** - Ensure new operations aren't interfering
4. **Document all findings** - Create knowledge base for future upgrades

---

## Resolution Summary

**Date**: 2025-10-18
**Status**: ✅ **RESOLVED** - All tests passing

### Root Causes Identified

**1. Validation Errors (2 tests)**:
- **Issue**: Parameter type validation was rejecting object literals for `cssProperties` and `animationProperties`
- **Location**: `packages/language/src/compiler/operations/validator.ts:332-340`
- **Root Cause**: `isTypeSingleCompatible()` only checked for generic `'object'` type string, not specialized property object types
- **Fix**: Added `cssProperties` and `animationProperties` to object type compatibility check
- **Result**: All 32 validation tests now pass

**2. Transformer Error (1 test)**:
- **Issue**: "Undefined variable reference (linking failed)" for `@item` in stagger block
- **Location**: `packages/language/src/compiler/__tests__/transformer.spec.ts:527`
- **Root Cause**: Test used incorrect syntax `@item` (VariableReference) instead of `@@currentItem` (SystemPropertyReference)
- **Fix**: Changed test DSL from `@item` to `@@currentItem` (consistent with for-loop `@@item` syntax)
- **Result**: All 35 transformer tests now pass

### Files Modified

1. **`packages/language/src/compiler/operations/validator.ts`**
   - Fixed object type compatibility for specialized property types

2. **`packages/language/src/compiler/__tests__/transformer.spec.ts`**
   - Corrected stagger test syntax from `@item` to `@@currentItem`

### Test Results

- **Before**: 297 passing, 3 failing, 8 skipped
- **After**: 300 passing, 0 failing, 8 skipped
- **Registry tests**: 24/24 passing (48 operations)
- **Biome checks**: ✅ All passed (0 errors, 0 warnings)

### Key Insights

1. **Type System Compatibility**: The Eligius parameter type system uses specialized types like `ParameterType:cssProperties` that need explicit handling in validation
2. **DSL Syntax Consistency**: Single `@` is for variable references, double `@@` is for system properties (loop context)
3. **Pre-existing Issues**: Test failures were introduced in commit 085c59f (2025-10-17) and unrelated to registry changes

---

**Plan Version**: 1.0
**Created**: 2025-10-18
**Resolved**: 2025-10-18
**Issue**: Test failures after Eligius 1.3.0 upgrade
**Actual Effort**: ~30 minutes
**Complexity**: Medium (investigation required, targeted fixes)
