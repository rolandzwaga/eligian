# Tasks: Fix For-Loop Variable References (BUG-001)

**Bug ID**: BUG-001
**Status**: Ready to Implement
**Tasks**: T320-T327 (8 tasks)

---

## Task List

### Phase 1: Reproduce and Understand

- [ ] **T320** [Bug][Repro] Create reproduction test file
  - Create `examples/for-loop-bug-reproduction.eligian`
  - Include for-loop with `@@varName` reference
  - Include action with `@varName` reference
  - Include action with bare `paramName` reference
  - Compile with CLI and document broken output
  - **File**: `examples/for-loop-bug-reproduction.eligian`

- [ ] **T321** [Bug][Test] Add failing integration tests
  - Add test: "should handle @@loopVar in for-loop operations"
  - Add test: "should handle @varName in action operations"
  - Add test: "should handle paramName in action operations"
  - Mark tests as `.failing()` or skip temporarily
  - Run tests to confirm they fail
  - **File**: `packages/language/src/compiler/__tests__/transformer.spec.ts`

### Phase 2: Fix Implementation

- [ ] **T322** [Bug][Fix] Transform expressions before mapping
  - Change `transformOperationCall()` to use `scope` parameter (remove underscore)
  - Add loop to transform each `args[i]` Expression → JsonValue
  - Pass `scope` to `transformExpression()` for reference resolution
  - Pass transformed args to `mapParameters()`
  - Add error handling for transformation failures
  - Build and verify no TypeScript errors
  - **File**: `packages/language/src/compiler/ast-transformer.ts:1098-1159`

- [ ] **T323** [Bug][Fix] Update mapper to accept JsonValue[]
  - Update `mapParameters()` signature: `args: Expression[]` → `args: JsonValue[]`
  - Update `mapPositionalToNamed()` signature similarly
  - Simplify `extractArgumentValue()`: just return the JsonValue (no AST traversal)
  - Remove imports: Expression, PropertyChainReference, isPropertyChainReference
  - Update JSDoc comments to reflect new design
  - Build and verify no TypeScript errors
  - **File**: `packages/language/src/compiler/operations/mapper.ts`

- [ ] **T324** [Bug][Test] Update mapper unit tests
  - Update test inputs to use JsonValue instead of AST Expression nodes
  - Add test: map string reference "$scope.currentItem"
  - Add test: map variable reference "$scope.variables.foo"
  - Add test: map parameter reference "$operationdata.bar"
  - Add test: nested objects with references
  - Ensure all existing tests still pass
  - **File**: `packages/language/src/compiler/operations/__tests__/mapper.spec.ts`

### Phase 3: Integration & Validation

- [ ] **T325** [Bug][Test] Enable and verify integration tests
  - Remove `.failing()` or skip from T321 tests
  - Run integration tests - verify they now pass
  - Verify operationData contains correct values:
    - `@@loopVar` → `{ param: "$scope.currentItem" }`
    - `@varName` → `{ param: "$scope.variables.varName" }`
    - `paramName` → `{ param: "$operationdata.paramName" }`
  - Add edge case tests if needed
  - **File**: `packages/language/src/compiler/__tests__/transformer.spec.ts`

- [ ] **T326** [Bug][Validate] Test with reproduction example
  - Compile `examples/for-loop-bug-reproduction.eligian` with CLI
  - Inspect compiled JSON output
  - Verify operationData is populated (not empty)
  - Verify all three reference types work correctly
  - Document success in bug spec
  - **File**: `examples/for-loop-bug-reproduction.eligian`

- [ ] **T327** [Bug][QA] Run full test suite and quality checks
  - Run `npm test` - verify all 298+ tests pass
  - Run `npm run check` - verify Biome clean (0 errors)
  - Run `npm run build` - verify clean build
  - Test CLI with existing examples
  - Update CLAUDE.md if needed (document the fix)
  - Mark bug as FIXED in spec
  - **Files**: All test files, CLAUDE.md

---

## Implementation Checklist

### Before Starting
- [X] Bug spec created and reviewed
- [X] Implementation plan created and reviewed
- [ ] Task list reviewed and understood

### During Implementation
- [ ] T320: Reproduction test file created
- [ ] T321: Failing tests added
- [ ] T322: ast-transformer.ts updated
- [ ] T323: mapper.ts updated
- [ ] T324: mapper.spec.ts updated
- [ ] T325: Integration tests passing
- [ ] T326: Reproduction example fixed
- [ ] T327: Quality checks passed

### After Implementation
- [ ] All tests passing (298+ tests)
- [ ] Biome clean (0 errors, 0 warnings)
- [ ] Clean build
- [ ] Bug marked as FIXED
- [ ] Documentation updated

---

## Success Criteria

✅ **Bug Fixed**: For-loop references compile to correct operationData

**Example**:
```eligian
for (section in ["intro", "main", "outro"]) {
  selectElement(@@section)
}
```

**Compiles to**:
```json
{
  "systemName": "selectElement",
  "operationData": {
    "selector": "$scope.currentItem"
  }
}
```

✅ **All Reference Types Work**:
- `@@systemProp` → `"$scope.systemProp"`
- `@@loopVar` → `"$scope.currentItem"` (aliased)
- `@varName` → `"$scope.variables.varName"`
- `paramName` → `"$operationdata.paramName"`

✅ **No Regressions**: All existing tests still pass

✅ **Code Quality**: Biome clean, clean build

---

## Risk Mitigation

**Risk**: Breaking existing functionality
**Mitigation**: Comprehensive test suite (298+ tests), careful review

**Risk**: Missing edge cases
**Mitigation**: Add tests for all reference types, nested structures

**Risk**: Performance impact
**Mitigation**: Transformation is lightweight (already done for other contexts)

---

## Notes

- This fix actually **simplifies** the mapper by moving complexity to the transformer where it belongs
- The transformer already has all the logic for handling references - we just need to use it
- Pre-transforming arguments is more correct semantically (separation of concerns)

---

**Next Steps**: Start implementation with T320 (Create reproduction test file)
