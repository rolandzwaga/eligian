# Feature Specification: Break and Continue Syntactic Sugar

## Overview

Add syntactic sugar for loop control operations (`break` and `continue`) to the Eligian DSL, providing familiar control flow keywords that compile to the underlying Eligius `breakForEach` and `continueForEach` operations.

## Motivation

Currently, developers must use explicit operation calls to control loop flow:

```eligian
for (item in slides) {
  if (@@currentItem.skip) {
    continueForEach()  // ← Verbose operation call
  }

  selectElement(@@currentItem.selector)

  if (@@currentItem.isLast) {
    breakForEach()  // ← Verbose operation call
  }
}
```

This is inconsistent with the DSL's philosophy of providing clean syntactic sugar for common patterns (like `for` loops and `if/else` statements). Most developers expect simple `break` and `continue` keywords from their programming experience.

## Goals

1. **Familiar Syntax**: Provide `break` and `continue` keywords that match common programming languages
2. **Compile-Time Validation**: Ensure `break`/`continue` only appear inside loops (compile error otherwise)
3. **Clean Semantics**: Map directly to Eligius `breakForEach` and `continueForEach` operations
4. **Zero Breaking Changes**: Existing code continues to work (both syntactic sugar and explicit operation calls)

## Non-Goals

- Label support for nested loops (Eligius doesn't support this)
- Alternative control flow patterns (like `return`, `exit`, etc.)
- Loop optimization or unrolling
- Support outside of `for` loops (e.g., in `while` loops - we don't have those)

## User Stories

### Story 1: Clean Loop Control Syntax

**As a** developer writing loop logic
**I want to** use simple `break` and `continue` keywords
**So that** my code is readable and familiar

```eligian
// Before (verbose operation calls)
for (slide in slides) {
  if ($operationdata.skip) {
    continueForEach()
  }

  processSlide(@@currentItem)

  if ($operationdata.isDone) {
    breakForEach()
  }
}

// After (clean syntax)
for (slide in slides) {
  if ($operationdata.skip) {
    continue  // ← Clean, familiar keyword
  }

  processSlide(@@currentItem)

  if ($operationdata.isDone) {
    break  // ← Clean, familiar keyword
  }
}
```

### Story 2: Compile-Time Validation

**As a** developer
**I want** compile errors when using `break`/`continue` incorrectly
**So that** I catch bugs before runtime

```eligian
action demo [
  // ❌ Compile error: 'break' can only be used inside a loop
  break

  // ❌ Compile error: 'continue' can only be used inside a loop
  continue
]

// ✅ Valid - inside a loop
for (item in items) {
  if (@@currentItem.invalid) {
    continue  // OK
  }

  if (@@currentItem.stop) {
    break  // OK
  }
}
```

### Story 3: Mixed Syntax Support

**As a** developer maintaining existing code
**I want** both explicit operations and keywords to work
**So that** I can gradually migrate to cleaner syntax

```eligian
for (item in items) {
  // Old style still works
  if (condition1) {
    continueForEach()
  }

  // New style also works
  if (condition2) {
    continue
  }

  // Both can coexist
  if (condition3) {
    breakForEach()
  }

  if (condition4) {
    break
  }
}
```

## Technical Requirements

### R1: Grammar Extensions

Add two new statement types to the grammar:

```langium
OperationStatement:
    IfStatement
    | ForStatement
    | VariableDeclaration
    | BreakStatement    // ← NEW
    | ContinueStatement // ← NEW
    | OperationCall;

BreakStatement:
    'break';

ContinueStatement:
    'continue';
```

**Location**: `packages/language/src/eligian.langium`

### R2: AST Transformer

Transform syntactic sugar to operation calls:

- `BreakStatement` → `OperationCall` with `operationName: "breakForEach"`, no arguments
- `ContinueStatement` → `OperationCall` with `operationName: "continueForEach"`, no arguments

**Location**: `packages/language/src/compiler/ast-transformer.ts`

**Implementation Pattern**:
```typescript
function* transformBreakStatement(
  stmt: BreakStatement,
  scope?: ScopeContext
): Effect.Effect<OperationConfigIR[], TransformError> {
  // Transform to breakForEach() operation call
  return [{
    systemName: 'breakForEach',
    operationData: {}
  }];
}

function* transformContinueStatement(
  stmt: ContinueStatement,
  scope?: ScopeContext
): Effect.Effect<OperationConfigIR[], TransformError> {
  // Transform to continueForEach() operation call
  return [{
    systemName: 'continueForEach',
    operationData: {}
  }];
}
```

### R3: Validation Rules

Add validation to ensure `break`/`continue` only appear inside loops:

**Location**: `packages/language/src/eligian-validator.ts`

**Rules**:
1. `BreakStatement` outside a `ForStatement` → **ERROR**: "break can only be used inside a loop"
2. `ContinueStatement` outside a `ForStatement` → **ERROR**: "continue can only be used inside a loop"

**Implementation Pattern**:
```typescript
checkBreakStatement(stmt: BreakStatement, accept: ValidationAcceptor): void {
  // Walk up AST to find containing ForStatement
  if (!isInsideForLoop(stmt)) {
    accept('error',
      "'break' can only be used inside a loop",
      { node: stmt }
    );
  }
}

checkContinueStatement(stmt: ContinueStatement, accept: ValidationAcceptor): void {
  // Walk up AST to find containing ForStatement
  if (!isInsideForLoop(stmt)) {
    accept('error',
      "'continue' can only be used inside a loop",
      { node: stmt }
    );
  }
}
```

### R4: Testing

**Unit Tests** (`packages/language/src/__tests__/parsing.spec.ts`):
- Parse `break` statement successfully
- Parse `continue` statement successfully
- Parse nested `break`/`continue` in loops

**Validation Tests** (`packages/language/src/__tests__/validation.spec.ts`):
- Error when `break` outside loop
- Error when `continue` outside loop
- No error when `break`/`continue` inside loop
- Nested loops work correctly

**Transformer Tests** (`packages/language/src/compiler/__tests__/transformer.spec.ts`):
- `break` transforms to `breakForEach` operation
- `continue` transforms to `continueForEach` operation
- Operations are correctly positioned in operation sequence

**Integration Tests** (`packages/language/src/compiler/__tests__/pipeline.spec.ts`):
- Full compilation of DSL with `break`/`continue`
- Generated JSON matches expected Eligius configuration

### R5: Documentation

Update documentation files:
- Grammar comments in `eligian.langium`
- Examples in `examples/` directory
- CLAUDE.md with new syntax patterns

## Design Constraints

1. **Langium Integration**: Use Langium's grammar and validation framework
2. **Zero Breaking Changes**: All existing code continues to work
3. **Constitution Compliance**: Follow all constitution principles (testing, documentation, Biome, etc.)
4. **Eligius Compatibility**: Generated operations must match Eligius expectations

## Success Criteria

1. ✅ `break` and `continue` parse correctly in grammar
2. ✅ Transformer generates correct `breakForEach`/`continueForEach` operations
3. ✅ Validation catches incorrect usage (outside loops) with clear errors
4. ✅ All existing tests pass (no regressions)
5. ✅ New tests cover all syntax and validation scenarios
6. ✅ Biome checks pass (code quality maintained)
7. ✅ Documentation updated with examples

## Implementation Phases

### Phase 1: Grammar and Parsing
- Add `BreakStatement` and `ContinueStatement` to grammar
- Update generated AST types
- Add parsing tests

### Phase 2: Transformer
- Implement `transformBreakStatement`
- Implement `transformContinueStatement`
- Add transformer tests

### Phase 3: Validation
- Implement `checkBreakStatement` validator
- Implement `checkContinueStatement` validator
- Add validation tests

### Phase 4: Integration and Documentation
- Full pipeline integration tests
- Add example files demonstrating usage
- Update CLAUDE.md and grammar documentation
- Run Biome checks and fix any issues

## Examples

### Example 1: Skip Invalid Items

```eligian
for (item in items) {
  if (@@currentItem.invalid) {
    continue  // Skip this iteration
  }

  processItem(@@currentItem)
}
```

**Generated Eligius Operations**:
```json
{
  "systemName": "forEach",
  "operationData": { "collection": "operationdata.items" }
},
{
  "systemName": "when",
  "operationData": { "condition": "scope.currentItem.invalid" }
},
{
  "systemName": "continueForEach",
  "operationData": {}
},
{
  "systemName": "endWhen",
  "operationData": {}
},
{
  "systemName": "startAction",
  "operationData": { "actionOperationData": { "item": "scope.currentItem" } }
},
{
  "systemName": "endForEach",
  "operationData": {}
}
```

### Example 2: Early Exit on Condition

```eligian
for (slide in slides) {
  processSlide(@@currentItem)

  if ($operationdata.errorOccurred) {
    break  // Exit loop immediately
  }
}
```

**Generated Eligius Operations**:
```json
{
  "systemName": "forEach",
  "operationData": { "collection": "operationdata.slides" }
},
{
  "systemName": "startAction",
  "operationData": { "actionOperationData": { "slide": "scope.currentItem" } }
},
{
  "systemName": "when",
  "operationData": { "condition": "operationdata.errorOccurred" }
},
{
  "systemName": "breakForEach",
  "operationData": {}
},
{
  "systemName": "endWhen",
  "operationData": {}
},
{
  "systemName": "endForEach",
  "operationData": {}
}
```

### Example 3: Nested Loops (Both Keywords Work)

```eligian
for (outer in outerItems) {
  for (inner in @@currentItem.innerItems) {
    if (@@currentItem.skipInner) {
      continue  // Skip inner iteration
    }

    if (@@currentItem.stopAll) {
      break  // Exit inner loop (Eligius doesn't support breaking outer)
    }

    processInnerItem(@@currentItem)
  }
}
```

## Dependencies

- Langium grammar and AST generation
- Existing operation registry (`breakForEach`, `continueForEach`)
- AST transformer infrastructure
- Validation framework

## Backwards Compatibility

**100% backwards compatible**:
- Existing code using `breakForEach()` operation calls continues to work
- Existing code without loop control continues to work
- No breaking changes to grammar, transformer, or validator
- Both syntactic sugar and explicit operations can coexist

## References

- Eligius loop operations: `breakForEach`, `continueForEach`, `forEach`, `endForEach`
- Operation registry: `packages/language/src/compiler/operations/registry.generated.ts`
- Existing syntactic sugar patterns: `if/else` → `when/otherwise/endWhen`, `for` → `forEach/endForEach`
- Constitution Principle X: Validation Pattern (compiler-first)
- Constitution Principle XIII: Operation Metadata Consultation
