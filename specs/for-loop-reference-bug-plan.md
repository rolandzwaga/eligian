# Implementation Plan: Fix For-Loop Variable References

**Bug ID**: BUG-001
**Status**: Planning
**Estimated Tasks**: 8 tasks (T320-T327)
**Estimated Time**: 2-3 hours

---

## Overview

This plan addresses the bug where reference expressions (`@@varName`, `@varName`, `paramName`) used as operation arguments are not properly transformed, resulting in empty `operationData`.

**Strategy**: Transform Expression arguments to JsonValue **before** calling the parameter mapper, using the existing `transformExpression()` function which already handles all reference types correctly.

---

## Phase 1: Reproduce and Understand (T320-T321)

### T320: Create reproduction test file

**Goal**: Create a minimal test case that demonstrates the bug

**Actions**:
1. Create `examples/for-loop-bug-reproduction.eligian`
2. Include all three reference types (@@, @, bare identifier)
3. Attempt to compile with CLI
4. Document the broken output

**Expected Behavior**: Compilation succeeds but operationData is empty

**Acceptance Criteria**:
- [ ] Test file created
- [ ] CLI compilation attempted
- [ ] Bug confirmed in output JSON

**Files Created**:
- `examples/for-loop-bug-reproduction.eligian`

### T321: Add failing integration tests

**Goal**: Add tests that currently fail, demonstrating the bug

**Actions**:
1. Add test to `transformer.spec.ts`: "should handle @@loopVar in for-loop operations"
2. Add test to `transformer.spec.ts`: "should handle @varName in action operations"
3. Add test to `transformer.spec.ts`: "should handle paramName in action operations"
4. Run tests - confirm they fail
5. Mark tests with `.failing()` or skip them temporarily

**Acceptance Criteria**:
- [ ] 3 new failing tests added
- [ ] Tests demonstrate the bug clearly
- [ ] Tests document expected behavior

**Files Modified**:
- `packages/language/src/compiler/__tests__/transformer.spec.ts`

---

## Phase 2: Fix Implementation (T322-T324)

### T322: Transform expressions before mapping

**Goal**: Change `transformOperationCall()` to transform arguments before calling mapper

**Current Code** (ast-transformer.ts:1098-1159):
```typescript
const transformOperationCall = (
  opCall: OperationCall,
  _scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR, TransformError> =>
  Effect.gen(function* (_) {
    // ... validation ...

    // Map positional arguments to named parameters using operation signature
    const mappingResult = mapParameters(signature, args);  // ❌ args are Expression[]
```

**New Code**:
```typescript
const transformOperationCall = (
  opCall: OperationCall,
  scope: ScopeContext = createEmptyScope()  // Use scope, don't ignore
): Effect.Effect<OperationConfigIR, TransformError> =>
  Effect.gen(function* (_) {
    // ... validation ...

    // ✅ Transform arguments to JsonValue first
    const transformedArgs: JsonValue[] = [];
    for (const arg of args) {
      const value = yield* _(transformExpression(arg, scope));
      transformedArgs.push(value);
    }

    // Map positional arguments to named parameters using operation signature
    const mappingResult = mapParameters(signature, transformedArgs);
```

**Actions**:
1. Remove `_scope` underscore (we need it now!)
2. Add loop to transform each argument Expression to JsonValue
3. Pass `scope` to `transformExpression()` for proper reference resolution
4. Pass `transformedArgs` to `mapParameters()` instead of raw `args`
5. Add error handling for transformation failures

**Acceptance Criteria**:
- [ ] All arguments transformed before mapping
- [ ] Scope context passed through correctly
- [ ] Error handling preserves source location
- [ ] Code compiles without errors

**Files Modified**:
- `packages/language/src/compiler/ast-transformer.ts`

### T323: Update mapper to accept JsonValue[]

**Goal**: Change mapper signature to accept pre-transformed values

**Current Signature** (mapper.ts:211):
```typescript
export function mapParameters(signature: OperationSignature, args: Expression[]): MappingResult
```

**New Signature**:
```typescript
export function mapParameters(signature: OperationSignature, args: JsonValue[]): MappingResult
```

**Changes Required**:
1. Update `mapParameters()` signature
2. Update `mapPositionalToNamed()` signature
3. Simplify `extractArgumentValue()` to just handle JsonValue (no more AST traversal)
4. Remove imports of AST types (Expression, PropertyChainReference)
5. Update all JSDoc

**Simplified `extractArgumentValue()`**:
```typescript
function extractArgumentValue(arg: JsonValue): JsonValue {
  // Arguments are already transformed - just return them!
  // No need for switch statement or AST traversal
  return arg;
}
```

**Actions**:
1. Update function signatures
2. Simplify `extractArgumentValue()` (it's now trivial!)
3. Remove unnecessary imports
4. Update JSDoc comments
5. Update `resolvePropertyChain()` usage (no longer needed in mapper)

**Acceptance Criteria**:
- [ ] Mapper accepts JsonValue[] instead of Expression[]
- [ ] extractArgumentValue() simplified
- [ ] All imports updated
- [ ] JSDoc updated
- [ ] Code compiles

**Files Modified**:
- `packages/language/src/compiler/operations/mapper.ts`
- `packages/language/src/compiler/operations/types.ts` (if needed)

### T324: Update mapper tests

**Goal**: Update unit tests to reflect new signature

**Changes Required**:
1. Update test inputs to use JsonValue instead of Expression AST nodes
2. Add tests for reference strings: "$scope.currentItem", "$scope.variables.foo", "$operationdata.bar"
3. Remove AST node construction (no longer needed)
4. Add comprehensive test coverage for all value types

**Example Test**:
```typescript
test('should map string reference argument', () => {
  const signature = getOperationSignature('selectElement');
  const args = ["$scope.currentItem"];  // ✅ Pre-transformed JsonValue

  const result = mapParameters(signature, args);

  expect(result.success).toBe(true);
  expect(result.operationData).toEqual({
    selector: "$scope.currentItem"
  });
});
```

**Actions**:
1. Update existing mapper tests
2. Add new tests for reference strings
3. Add tests for nested objects/arrays with references
4. Ensure 100% coverage of all JsonValue types

**Acceptance Criteria**:
- [ ] All existing tests updated and passing
- [ ] New tests for reference strings added
- [ ] Test coverage maintained or improved
- [ ] All tests passing

**Files Modified**:
- `packages/language/src/compiler/operations/__tests__/mapper.spec.ts`

---

## Phase 3: Integration & Validation (T325-T327)

### T325: Enable and verify integration tests

**Goal**: Un-skip the failing tests from T321 and verify they now pass

**Actions**:
1. Remove `.failing()` or skip from T321 tests
2. Run integration tests
3. Verify all tests pass
4. Add additional edge case tests if needed

**Test Cases to Verify**:
```typescript
test('should handle @@loopVar in for-loop operations', async () => {
  const code = `
    action test() [
      for (item in ["a", "b", "c"]) {
        selectElement(@@item)
      }
    ]
    timeline "test" using raf {}
  `;

  const result = await compileProgram(code);

  // Find the selectElement operation
  const selectOp = findOperation(result, 'selectElement');
  expect(selectOp.operationData).toEqual({
    selector: "$scope.currentItem"  // ✅ Aliased correctly
  });
});

test('should handle @varName in action operations', async () => {
  const code = `
    action test() [
      const selector = "#box"
      selectElement(@selector)
    ]
    timeline "test" using raf {}
  `;

  const result = await compileProgram(code);

  const selectOp = findOperation(result, 'selectElement');
  expect(selectOp.operationData).toEqual({
    selector: "$scope.variables.selector"  // ✅ Variable reference
  });
});

test('should handle paramName in action operations', async () => {
  const code = `
    action test(selector) [
      selectElement(selector)
    ]
    timeline "test" using raf {}
  `;

  const result = await compileProgram(code);

  const selectOp = findOperation(result, 'selectElement');
  expect(selectOp.operationData).toEqual({
    selector: "$operationdata.selector"  // ✅ Parameter reference
  });
});
```

**Acceptance Criteria**:
- [ ] All T321 tests now passing
- [ ] Integration tests verify correct JSON output
- [ ] Edge cases covered

**Files Modified**:
- `packages/language/src/compiler/__tests__/transformer.spec.ts`

### T326: Test with reproduction example

**Goal**: Verify the original bug is fixed end-to-end

**Actions**:
1. Compile `examples/for-loop-bug-reproduction.eligian` with CLI
2. Inspect compiled JSON output
3. Verify operationData is correctly populated
4. Test with VS Code extension (optional)

**Expected Output**:
```json
{
  "systemName": "selectElement",
  "operationData": {
    "selector": "$scope.currentItem"
  }
}
```

**Acceptance Criteria**:
- [ ] Example file compiles successfully
- [ ] operationData populated correctly
- [ ] All reference types working

**Files Used**:
- `examples/for-loop-bug-reproduction.eligian`

### T327: Run full test suite and quality checks

**Goal**: Ensure no regressions and maintain code quality

**Actions**:
1. Run full test suite: `npm test`
2. Verify all 298+ tests still pass
3. Run Biome: `npm run check`
4. Build all packages: `npm run build`
5. Test CLI with existing examples
6. Update CLAUDE.md if needed

**Acceptance Criteria**:
- [ ] All tests passing (298+ tests)
- [ ] Biome clean (0 errors, 0 warnings)
- [ ] Clean build
- [ ] Existing examples still compile
- [ ] No regressions

**Files to Check**:
- All test files
- All example files
- Build output

---

## Summary

**Total Tasks**: 8 (T320-T327)

**Task Breakdown**:
- **Phase 1** (Reproduce): 2 tasks
- **Phase 2** (Fix): 3 tasks
- **Phase 3** (Validate): 3 tasks

**Key Changes**:
1. Transform expressions before mapping (ast-transformer.ts)
2. Simplify mapper to accept JsonValue[] (mapper.ts)
3. Add comprehensive tests (transformer.spec.ts, mapper.spec.ts)

**Risk Assessment**: Low
- Changes are localized to 2 files
- Existing logic (transformExpression) already works correctly
- Comprehensive test coverage will prevent regressions

---

**Next Steps**: See [for-loop-reference-bug-tasks.md](./for-loop-reference-bug-tasks.md) for detailed task checklist.
