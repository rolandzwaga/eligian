# Bug Spec: For-Loop Variable References Not Compiled

**ID**: BUG-001
**Priority**: P0 (Critical - Data Loss)
**Status**: Identified
**Discovered**: 2025-10-17
**Component**: Compiler / Operation Parameter Mapping

---

## Summary

When using for-loop iteration variable references (`@@varName`) as operation arguments inside for loops, the compiler fails to include them in the compiled `operationData`, resulting in empty operation data objects.

## Reproduction

**Input DSL** (`for-loop-bug.eligian`):
```eligian
action testLoop() [
  for (section in ["intro", "main", "outro"]) {
    selectElement(@@section)
    addClass("active")
    wait(500)
  }
]

timeline "test" using raf {
  at 0s..5s {
    testLoop()
  }
}
```

**Expected Compiled Output**:
```json
{
  "id": "...",
  "systemName": "selectElement",
  "operationData": {
    "selector": "$scope.currentItem"
  }
}
```

**Actual Compiled Output**:
```json
{
  "id": "...",
  "systemName": "selectElement",
  "operationData": {}
}
```

## Root Cause Analysis

### Location
`packages/language/src/compiler/operations/mapper.ts:106-136`

### The Bug
The `extractArgumentValue()` function has a switch statement that handles various Expression types. It is missing cases for:
1. **`SystemPropertyReference`** (`@@varName`) - This is the immediate bug
2. **`VariableReference`** (`@varName`) - Also broken but not discovered yet
3. **`ParameterReference`** (bare identifiers like `selector`) - Also broken

When encountering these reference types, the function falls through to the `default` case and returns `undefined`, which causes the parameter to be omitted from `operationData`.

### Code Path
1. **For-loop transformation** (ast-transformer.ts:1297-1340)
   - Creates `forEach` operation correctly
   - Creates loop scope with `loopVariableName: "section"`
   - Transforms body operations with loop scope

2. **Operation call transformation** (ast-transformer.ts:1098-1159)
   - Calls `mapParameters(signature, args)`
   - Arguments are AST Expression nodes (not yet transformed to JsonValue)

3. **Parameter mapping** (mapper.ts:211-227)
   - Calls `mapPositionalToNamed(signature, args)`
   - Calls `extractArgumentValue(arg)` for each argument

4. **❌ Bug occurs here** (mapper.ts:106-136)
   - `extractArgumentValue()` doesn't handle `SystemPropertyReference`
   - Returns `undefined`
   - `mapPositionalToNamed()` sets `operationData[param.name] = undefined`
   - JSON serialization omits `undefined` values → empty object

### Why This Wasn't Caught

1. **No integration tests for for-loops with references**
   - Existing for-loop tests use literals: `for (item in [1, 2, 3])`
   - No tests using `@@item` inside loop body

2. **Mapper tests don't cover references**
   - `mapper.spec.ts` only tests literals and property chains
   - Missing test cases for `@@`, `@`, and bare identifier references

3. **Transformer tests don't validate operationData**
   - Transformer tests check structure but not actual parameter values
   - Missing end-to-end compilation validation

## Impact

**Severity**: P0 (Critical)
- **Data Loss**: Operation arguments are completely lost
- **Silent Failure**: Compiles without error but produces broken output
- **Runtime Failure**: Eligius operations receive empty operationData
- **User Impact**: For-loops with variable references don't work at all

**Affected Features**:
- ✅ For loops with literal values (e.g., `for (x in [1,2,3])`) - Works
- ❌ For loops with `@@varName` references - Broken
- ❌ Actions with `@varName` references - Likely broken
- ❌ Actions with bare parameter references - Likely broken

## Fix Strategy

### Approach
The fix requires making `extractArgumentValue()` aware of the scope context so it can properly transform reference expressions.

### Two Options

**Option 1: Transform in ast-transformer.ts (Recommended)**
- Transform all Expression arguments to JsonValue **before** calling `mapParameters()`
- Use existing `transformExpression()` which already handles all reference types
- Mapper receives pre-transformed JsonValue arguments (strings for references)
- Cleaner separation: transformer handles semantics, mapper handles structure

**Option 2: Add scope to mapper**
- Thread `ScopeContext` through mapper functions
- Implement reference resolution in `extractArgumentValue()`
- More invasive change, duplicates logic from transformer

**Recommendation**: Option 1 - Transform expressions before mapping

### Implementation Plan

1. **Change operation call transformation** (ast-transformer.ts)
   - Transform each argument Expression to JsonValue before calling mapper
   - Pass JsonValue[] to mapper instead of Expression[]

2. **Update mapper signature** (mapper.ts)
   - Change `mapParameters()` to accept `JsonValue[]` instead of `Expression[]`
   - Update `extractArgumentValue()` to work with JsonValue (much simpler)

3. **Add comprehensive tests**
   - Integration tests for for-loops with `@@varName`
   - Integration tests for actions with `@varName`
   - Integration tests for parameter references
   - Mapper tests with pre-transformed values

4. **Validate all reference types**
   - `@@systemProp` → `"$scope.systemProp"`
   - `@@loopVar` → `"$scope.currentItem"` (aliased)
   - `@varName` → `"$scope.variables.varName"`
   - `paramName` → `"$operationdata.paramName"`

## Success Criteria

- [ ] For-loop example compiles with correct operationData
- [ ] `selectElement(@@section)` → `{ selector: "$scope.currentItem" }`
- [ ] All reference types handled correctly
- [ ] All existing tests still pass (backwards compatibility)
- [ ] New integration tests added for all reference scenarios
- [ ] CLI compilation succeeds for test cases

## Test Cases

### Test 1: For-loop with system property reference
```eligian
action test() [
  for (item in ["a", "b", "c"]) {
    selectElement(@@item)  // Should compile to { selector: "$scope.currentItem" }
  }
]
```

### Test 2: Action with variable reference
```eligian
action test() [
  const selector = "#box"
  selectElement(@selector)  // Should compile to { selector: "$scope.variables.selector" }
]
```

### Test 3: Action with parameter reference
```eligian
action test(selector) [
  selectElement(selector)  // Should compile to { selector: "$operationdata.selector" }
]
```

### Test 4: Nested for-loop references
```eligian
action test() [
  for (section in ["intro", "main"]) {
    selectElement(@@section)
    for (item in [1, 2, 3]) {
      setData({ index: @@item })  // Nested loop variable
    }
  }
]
```

## Related Code

**Files to Modify**:
- `packages/language/src/compiler/ast-transformer.ts` (transformOperationCall)
- `packages/language/src/compiler/operations/mapper.ts` (mapParameters, extractArgumentValue)
- `packages/language/src/compiler/operations/types.ts` (update types if needed)

**Files to Add Tests**:
- `packages/language/src/compiler/__tests__/transformer.spec.ts` (integration tests)
- `packages/language/src/compiler/operations/__tests__/mapper.spec.ts` (unit tests)
- `examples/for-loop-references-test.eligian` (example file)

---

**Next Steps**: See [for-loop-reference-bug-plan.md](./for-loop-reference-bug-plan.md) for implementation plan.
