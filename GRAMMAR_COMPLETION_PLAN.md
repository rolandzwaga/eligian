# Phase 5.5: Complete Grammar Implementation

**Goal**: Extend the grammar to support all 47 Eligius operations with proper parameter mapping and validation

**Status**: Planning
**Created**: 2025-10-15
**Estimated Effort**: 2-3 days

---

## Current State

### What Works ✅
- **Grammar foundation**: Function-style operation calls, property chains ($), operation lists
- **Basic operations**: Grammar accepts any operation name (operation-agnostic design)
- **Action definitions**: Regular and endable actions
- **Timeline events**: Named and inline endable actions
- **Expressions**: Literals, objects, arrays, property chains, binary expressions
- **All 115 tests passing**: Language (44) + Compiler (71)

### Current Limitations ❌
- **No operation signature validation**: Grammar accepts any operation with any arguments
- **No parameter type checking**: Can pass wrong types to operations (string where number expected)
- **No dependency validation**: Can't check if required dependencies are available (e.g., `selectedElement` for `addClass`)
- **No output tracking**: Can't track which operations produce which outputs
- **No control flow validation**: Can't validate `when`/`otherwise`/`endWhen` pairing
- **No config blocks**: Can't specify engine configuration (id, container, language)

---

## Design Approach

### Option A: Type-Safe Operation Registry (RECOMMENDED)

**Concept**: Create a TypeScript operation registry that defines signatures for all 47 operations, then use this for:
1. Compiler validation (ensure correct parameters at compile time)
2. VS Code autocompletion (show parameter names and types)
3. Error reporting (helpful messages about missing/wrong parameters)

**Benefits**:
- Type-safe at compile time
- Better error messages
- IDE support with parameter hints
- Single source of truth for operation signatures

**Implementation**:
- Grammar remains operation-agnostic (any operation name allowed)
- Validation layer checks operation signatures
- Transformer maps positional arguments to named parameters

### Option B: Grammar-Level Operation Validation

**Concept**: Encode all operations directly in the grammar with typed parameters

**Drawbacks**:
- Grammar becomes huge (47 operations × multiple parameters each)
- Hard to maintain (must update grammar when Eligius adds operations)
- Grammar regeneration needed for any Eligius update
- Violates "operation-agnostic" design principle

**Decision**: ❌ Not recommended - too tightly coupled to Eligius implementation

---

## Recommended Implementation Plan

### Phase 5.5A: Operation Registry & Validation

#### Task Group A1: Operation Registry Infrastructure

**IMPLEMENTATION APPROACH: Use Eligius JSON Schemas** ✅

The Eligius library already provides JSON schemas for all 46 operations in `../eligius/jsonschema/operations/*.json`. These schemas contain:
- Operation names (`systemName`)
- Complete documentation (`description`)
- Required parameters (`operationData.required`)
- Parameter types and validation patterns
- No need to manually document operations!

**Supplemental Data Needed**:
Since JSON schemas don't capture `@dependency` and `@output` annotations from TypeScript, we'll maintain a small supplemental file for dependency/output tracking.

**T200** [Foundation] Create operation registry type system in `packages/compiler/src/operations/types.ts`
- Define `OperationParameter` interface (name, type, required, description, pattern)
- Define `OperationSignature` interface (systemName, description, parameters, dependencies, outputs)
- Define `OperationRegistry` type (map of operation name → signature)
- Define `DependencyInfo` interface (name, type) for tracking operation dependencies
- Define `OutputInfo` interface (name, type) for tracking operation outputs

**T201** [Foundation] Create JSON schema parser in `packages/compiler/src/operations/schema-parser.ts`
- Read JSON schema files from `../eligius/jsonschema/operations/*.json`
- Parse `systemName`, `description`, `operationData.required`, `operationData.properties`
- Extract parameter names, types, patterns from schema
- Return parsed `OperationSignature` objects

**T202** [Foundation] Create dependency/output metadata file in `packages/compiler/src/operations/metadata.ts`
- Manually document dependencies for each operation (e.g., `addClass` depends on `selectedElement: JQuery`)
- Document outputs for each operation (e.g., `selectElement` outputs `selectedElement: JQuery`)
- Export as `OPERATION_METADATA` constant with type `Record<string, { dependencies?: DependencyInfo[], outputs?: OutputInfo[] }>`
- This is a small file (~200 lines) covering all 46 operations

**T203** [Registry] Create operation registry generator in `packages/compiler/src/operations/generate-registry.ts`
- Read all JSON schemas from `../eligius/jsonschema/operations/`
- Parse each schema using schema-parser
- Merge with dependency/output metadata
- Generate TypeScript file `packages/compiler/src/operations/registry.generated.ts`
- Run as build step (npm script: `npm run generate:registry`)

**T204** [Registry] Create master registry exports in `packages/compiler/src/operations/index.ts`
- Export generated `OPERATION_REGISTRY` constant
- Export lookup functions:
  - `getOperationSignature(name: string): OperationSignature | undefined`
  - `hasOperation(name: string): boolean`
  - `getAllOperations(): OperationSignature[]`
  - `getOperationsByCategory(): Record<string, OperationSignature[]>`
- Export validation helper: `validateRegistry(): void` (checks no duplicates, all schemas valid)

#### Task Group A2: Operation Validation

**T213** [Validation] Implement operation existence check in `packages/compiler/src/operations/validator.ts`
- Check if operation name exists in registry
- Return `UnknownOperationError` with suggestions for similar names (typo detection)

**T214** [Validation] Implement parameter count validation in `packages/compiler/src/operations/validator.ts`
- Check if argument count matches required parameters
- Return `ParameterCountError` with expected vs actual count

**T215** [Validation] Implement parameter type validation in `packages/compiler/src/operations/validator.ts`
- Check if argument types match expected types (string, number, boolean, object, array, property chain)
- Handle property chain references (can't validate type at compile time, but check syntax)
- Return `ParameterTypeError` with expected vs actual type

**T216** [Validation] Implement dependency validation in `packages/compiler/src/operations/validator.ts`
- Track available outputs from previous operations in action
- Check if required dependencies are available (e.g., `selectedElement` for `addClass`)
- Return `MissingDependencyError` with operation that should provide the dependency

**T217** [Validation] Implement control flow pairing validation in `packages/compiler/src/operations/validator.ts`
- Check `when`/`endWhen` pairing (every `when` has matching `endWhen`)
- Check `forEach`/`endForEach` pairing
- Check `otherwise` appears only between `when` and `endWhen`
- Return `ControlFlowError` with unclosed/unmatched blocks

**T218** [Validation] Wire operation validator into AST transformer in `packages/compiler/src/ast-transformer.ts`
- Validate each `OperationCall` against registry before transforming
- Collect validation errors and fail transform if any errors found
- Include source location in all validation errors

**T219** [Validation] Wire operation validator into Langium validator in `packages/language/src/eligian-validator.ts`
- Add semantic check for operation calls
- Show validation errors in IDE (VS Code Problems panel)
- Provide quick fixes where possible (e.g., suggest correct parameter types)

#### Task Group A3: Parameter Mapping

**T220** [Transform] Implement positional-to-named parameter mapping in `packages/compiler/src/operations/mapper.ts`
- Map positional arguments to named parameters using operation signature
- Handle optional parameters (fill with undefined if not provided)
- Return `OperationConfigIR` with named parameters

**T221** [Transform] Implement property chain resolution in `packages/compiler/src/operations/mapper.ts`
- Convert `$context.foo` → `"context.foo"` string for Eligius runtime
- Convert `$operationdata.bar` → `"operationdata.bar"` string
- Convert `$globaldata.baz` → `"globaldata.baz"` string

**T222** [Transform] Implement wrapper object generation in `packages/compiler/src/operations/mapper.ts`
- Wrap parameters in required wrapper objects per Eligius spec
- Example: `animate(properties, duration)` → `{ animationProperties: properties, animationDuration: duration }`
- Use operation signature to determine correct wrapper structure

**T223** [Transform] Update AST transformer to use parameter mapper in `packages/compiler/src/ast-transformer.ts`
- Replace current naive argument mapping with registry-based mapping
- Include operation signature lookup
- Generate proper `OperationConfigIR` with `operationData` object

#### Task Group A4: Testing

**T224** [P] [Test] Create operation registry tests in `packages/compiler/src/operations/__tests__/registry.spec.ts`
- Test all 47 operations are registered
- Test no duplicate operation names
- Test parameter definitions are valid (required parameters, types)

**T225** [P] [Test] Create operation validator tests in `packages/compiler/src/operations/__tests__/validator.spec.ts`
- Test unknown operation detection
- Test parameter count validation
- Test parameter type validation
- Test dependency validation
- Test control flow pairing validation

**T226** [P] [Test] Create parameter mapper tests in `packages/compiler/src/operations/__tests__/mapper.spec.ts`
- Test positional-to-named mapping for all operations
- Test property chain resolution
- Test wrapper object generation

**T227** [Test] Update transformer tests in `packages/compiler/src/__tests__/transformer.spec.ts`
- Test operation validation errors
- Test parameter mapping for common operations
- Test dependency tracking across operation chain

**T228** [Test] Update validation tests in `packages/language/src/__tests__/validation.spec.ts`
- Test operation-level validation in Langium
- Test error messages and source locations

**Checkpoint A**: Operation registry complete with validation and parameter mapping. All operations have defined signatures and are validated at compile time.

---

### Phase 5.5B: Configuration Blocks (Optional)

**Purpose**: Allow users to specify engine configuration in DSL

#### Syntax Design

```eligian
config {
  id: "my-presentation"
  container: "#app"
  language: "en"
  layoutTemplate: "default"
}

timeline "main" using video from "video.mp4" {
  at 0s..5s [
    selectElement("#title")
    addClass("visible")
  ] [
    removeClass("visible")
  ]
}
```

#### Task Group B1: Grammar Extension

**T230** [Grammar] Add ConfigBlock production to grammar in `packages/language/src/eligian.langium`
- Define `ConfigBlock` rule: `'config' '{' (properties += ConfigProperty)* '}'`
- Define `ConfigProperty` rule: `key=ID ':' value=ConfigValue`
- Define `ConfigValue` union: `STRING | NUMBER | BOOLEAN`
- Add `ConfigBlock?` to `Program` element list

**T231** [Grammar] Define allowed config properties in grammar
- `id`, `containerSelector`, `language`, `layoutTemplate`
- `availableLanguages` (array of strings)
- Validate property names in semantic validation

**T232** [Validation] Add config block validation in `packages/language/src/eligian-validator.ts`
- Check no duplicate config properties
- Check property names are valid IEngineConfiguration keys
- Check property values have correct types (string, number, boolean, array)

**T233** [Transform] Handle config block in AST transformer in `packages/compiler/src/ast-transformer.ts`
- Extract config properties from `ConfigBlock` AST node
- Merge with default values from `packages/compiler/src/defaults.ts`
- Apply to `IEngineConfiguration` in output

**T234** [Test] Add config block tests
- Create fixtures with config blocks
- Test config block parsing
- Test config block validation
- Test config merge with defaults

**Checkpoint B**: Config blocks supported in DSL, allowing users to configure engine properties.

---

### Phase 5.5C: Enhanced Type Checking (Optional)

**Purpose**: Deeper type analysis for better compile-time error detection

#### Task Group C1: Advanced Type Inference

**T240** [TypeCheck] Implement expression type inference in `packages/compiler/src/type-checker.ts`
- Infer types of binary expressions (number + number → number)
- Infer types of property chain references (based on operation outputs)
- Infer types of object literal properties

**T241** [TypeCheck] Implement flow-sensitive type checking in `packages/compiler/src/type-checker.ts`
- Track available outputs through operation flow
- Detect when required dependencies are not available
- Warn when outputs are overwritten without being used

**T242** [TypeCheck] Add type narrowing for control flow in `packages/compiler/src/type-checker.ts`
- Track available types within `when`/`otherwise` blocks
- Track loop iteration types in `forEach` blocks
- Detect unreachable code after control flow

**Checkpoint C**: Advanced type checking provides more compile-time error detection and better IDE experience.

---

## Implementation Order

### Recommended Sequence

1. **Phase 5.5A (Operation Registry)** - PRIORITY 1
   - Most valuable for users (better errors, IDE support)
   - Required foundation for other phases
   - **Estimated effort**: 2-3 days

2. **Phase 5.5B (Config Blocks)** - PRIORITY 2
   - Nice-to-have for full DSL coverage
   - Independent of operation registry
   - **Estimated effort**: 4-6 hours

3. **Phase 5.5C (Enhanced Type Checking)** - PRIORITY 3
   - Polish work, not essential for MVP
   - Depends on operation registry
   - **Estimated effort**: 1-2 days

### Parallel Work Opportunities

- **T202-T211** (operation registry docs) can all run in parallel
- **T224-T226** (tests) can run in parallel with implementation
- Phase 5.5B and 5.5C are independent (can be done in any order after 5.5A)

---

## Success Criteria

### Phase 5.5A Success
- ✅ All 47 operations have registered signatures
- ✅ Compiler validates operation calls against registry
- ✅ Helpful error messages for wrong operation usage
- ✅ Parameter mapping converts positional to named arguments
- ✅ All tests pass (add ~30 new tests)

### Phase 5.5B Success
- ✅ Config blocks parse correctly
- ✅ Config properties merge with defaults
- ✅ Validation catches invalid config properties
- ✅ All tests pass (add ~10 new tests)

### Phase 5.5C Success
- ✅ Type inference works for expressions
- ✅ Flow-sensitive checking detects missing dependencies
- ✅ Control flow type narrowing works
- ✅ All tests pass (add ~15 new tests)

---

## Risk Assessment

### Low Risk
- **Operation registry creation**: Just data entry, well-defined scope
- **Config blocks**: Simple grammar extension, isolated feature

### Medium Risk
- **Parameter mapping**: Need to handle all parameter types correctly (especially objects with wrapper patterns)
- **Dependency validation**: Need to track operation data flow accurately

### High Risk
- **Enhanced type checking**: Complex flow analysis, potential for bugs
- **VS Code integration**: Need to test IDE features thoroughly

---

## Future Enhancements (Out of Scope)

These are potential future improvements not part of Phase 5.5:

1. **Operation Snippets**: VS Code snippets for common operation patterns
2. **Operation Documentation**: Hover tooltips showing operation docs from registry
3. **Refactoring Tools**: Rename operation parameters, extract action definitions
4. **Linting Rules**: Warn about deprecated operations, suggest best practices
5. **Operation Composition Analysis**: Detect inefficient operation chains
6. **Auto-import**: Suggest operations based on context

---

## Questions for Discussion

1. **Scope**: Should we do all of 5.5A, or start with just operation registry (T200-T212)?
2. **Config blocks**: Is this feature needed for MVP, or can it wait?
3. **Testing strategy**: Should we create comprehensive operation tests for all 47 operations?
4. **VS Code priority**: Should we focus on compiler validation first, or wire IDE validation earlier?

---

**Next Steps After Plan Approval**:
1. Review plan with stakeholder
2. Add selected tasks to `specs/main/tasks.md`
3. Begin implementation with T200 (Operation Registry Infrastructure)
4. Update progress with TodoWrite tool as tasks complete

---

## UPDATED APPROACH: Use Eligius Metadata (2025-10-15)

**Decision**: Use `../eligius/src/operation/metadata/*.ts` instead of JSON schemas

### Why Metadata > JSON Schemas

✅ **Rich ParameterTypes**: 23 types (className, selector, actionName, etc.) vs basic types
✅ **Explicit dependencies**: `dependentProperties` field
✅ **Explicit outputs**: `outputProperties` field  
✅ **Constant values**: Enum-like constraints built-in
✅ **TypeScript-native**: Import directly, always accurate
✅ **48 metadata files**: All operations covered

### Updated Task Group A1

**T200**: Create type system with 23 ParameterTypes from Eligius
**T201**: Create metadata converter (Eligius metadata → our format)
**T202**: Create generator (import all 47 functions, convert, generate registry)
**T203**: Export registry with lookup functions

**Reduced from 5 tasks to 4 tasks**, **0.5-1 day effort**

See METADATA_APPROACH_SUMMARY.md for detailed comparison.

