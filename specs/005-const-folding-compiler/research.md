# Research: Constant Folding Optimization

**Feature**: Constant Folding Optimization
**Branch**: `005-const-folding-compiler`
**Date**: 2025-01-23

## Overview

This document captures research findings and design decisions for implementing constant folding in the Eligian compiler. Constant folding is a standard compiler optimization that replaces references to compile-time constants with their literal values, eliminating runtime lookups and reducing generated code size.

---

## Research Areas

### 1. Constant Folding Patterns

**Question**: What are the standard approaches for implementing constant folding in compilers?

**Findings**:

**Standard Pattern** (used by TypeScript, Rust, GCC):
1. **Build Phase**: During AST traversal, identify `const` declarations and build a symbol table/map of constant names → values
2. **Replace Phase**: During code generation, replace all variable references that exist in the constant map with their literal values
3. **Optimize Phase**: Remove dead code (unused constants, unreachable init actions)

**Key Insights**:
- Constant folding is typically an **early optimization pass** (before other optimizations)
- Symbol table should be **immutable** after build phase (functional approach)
- Type information must be preserved (string vs. number vs. boolean)
- Transitive dependencies require **topological sort** or **lazy evaluation**

**References**:
- TypeScript compiler (`checker.ts`): Uses symbol tables with binding contexts
- Rust compiler (`const_eval`): Separate const evaluation phase with CTFE (Compile-Time Function Evaluation)
- LLVM: Constant folding in optimizer passes (instruction combining)

### 2. Expression Evaluation Strategies

**Question**: How should we safely evaluate constant expressions at compile time (e.g., `const SUM = 10 + 20;`)?

**Decision**: **Custom Evaluator** (lightweight, safe)

**Rationale**:
- **Requirement**: Evaluate only simple expressions (arithmetic, string concat, logical ops) - no function calls, loops, or complex control flow
- **Safety**: Prevent infinite loops, stack overflows, and type errors at compile time
- **Performance**: Evaluation must be fast (<1ms per expression) to meet SC-003 (<10% compile time increase)

**Alternatives Considered**:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Custom Evaluator** | Full control, safe, fast, no dependencies | Requires implementation effort | ✅ **CHOSEN** |
| **`eval()` or `Function()`** | Simple, handles all JS | **UNSAFE** (arbitrary code execution), security risk | ❌ Rejected |
| **js-interpreter** library | Full JS support | Overkill (2000+ LOC), slow, unnecessary complexity | ❌ Rejected |
| **TypeScript Compiler API** | Reuses existing compiler | Heavy dependency, complex API, slow | ❌ Rejected |

**Implementation Approach**:
```typescript
// Pseudocode for custom evaluator
function evaluateExpression(expr: Expression, constants: ConstantMap): LiteralValue | Error {
  switch (expr.type) {
    case 'BinaryExpression':
      const left = evaluateExpression(expr.left, constants);
      const right = evaluateExpression(expr.right, constants);
      return applyOperator(expr.operator, left, right); // +, -, *, /, &&, ||, etc.

    case 'Literal':
      return expr.value; // Already a constant

    case 'VariableReference':
      if (constants.has(expr.name)) {
        return constants.get(expr.name).value; // Resolve constant
      }
      return Error('Cannot evaluate: references non-constant');

    case 'UnaryExpression':
      const operand = evaluateExpression(expr.operand, constants);
      return applyUnary(expr.operator, operand); // !, -, +

    default:
      return Error('Cannot evaluate complex expression'); // For loops, function calls, etc.
  }
}
```

**Supported Operations** (User Story 3):
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- String concatenation: `+` (when operands are strings)
- Logical: `&&`, `||`, `!`
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Unary: `!`, `-`, `+`

**Out of Scope**:
- Function calls (e.g., `Math.sqrt(9)`)
- Array/object operations (e.g., `[1, 2].length`)
- Control flow (e.g., ternary `? :` - can be added later)

### 3. Symbol Table Structure

**Question**: How should we represent the constant map?

**Decision**: **Simple `Map<string, ConstantValue>`**

**Rationale**:
- **Simplicity**: Constants have no hierarchy, scoping issues, or mutation (all global, immutable)
- **Performance**: Map lookup is O(1)
- **Type Safety**: `ConstantValue` interface captures name, value, and type

**Data Structure**:
```typescript
interface ConstantValue {
  name: string;                          // e.g., "MESSAGE"
  value: string | number | boolean;      // e.g., "hello"
  type: 'string' | 'number' | 'boolean'; // For type preservation
}

type ConstantMap = Map<string, ConstantValue>;
```

**Alternatives Considered**:
- **Nested Maps** (for scoped constants): Overkill - MVP only handles global scope
- **AST Node Storage** (store full AST subtree): Unnecessary - we only need the evaluated value
- **TypeScript Symbol** (reuse Langium symbols): Adds coupling, harder to test

### 4. Optimization Pass Placement

**Question**: Where in the compilation pipeline should constant folding occur?

**Decision**: **Before existing optimizer passes**

**Rationale**:
- Constant folding creates opportunities for **downstream optimizations** (dead code elimination, control flow simplification)
- Must run **after** AST transformation (need full AST) but **before** JSON emission
- Compatible with existing Effect-ts pipeline structure

**Pipeline Order**:
```
1. Parse (Langium)           → AST
2. Validate (Langium)        → Validated AST
3. Type Check                → Typed AST
4. Transform (ast-transformer) → Eligius IR
   ├── Build constant map       ← NEW (Phase 1)
   └── Replace references       ← NEW (Phase 1)
5. Optimize (optimizer)      → Optimized IR
   └── Constant folding pass    ← NEW (Phase 2 - cleanup dead init)
6. Emit (emitter)            → JSON

```

**Integration Point**: Extend `ast-transformer.ts` to build constant map during initial traversal, then use it during transformation. The existing `optimizer.ts` can add a pass to remove empty init actions if all constants were folded.

### 5. Transitive Constant Resolution

**Question**: How should we handle `const A = 5; const B = A + 3;`?

**Decision**: **Lazy Evaluation with Dependency Tracking**

**Rationale**:
- **Problem**: Constants can reference other constants (transitive dependencies)
- **Solution**: Evaluate constants in dependency order (topological sort) or use lazy evaluation
- **Simplicity**: Lazy evaluation is simpler - evaluate expressions recursively, resolving dependencies on-demand

**Implementation Approach**:
```typescript
function evaluateConstant(name: string, decls: Map<string, ConstDeclaration>, cache: ConstantMap): LiteralValue {
  // Check cache first (memoization)
  if (cache.has(name)) {
    return cache.get(name).value;
  }

  const decl = decls.get(name);
  if (!decl) {
    throw new Error(`Undefined constant: ${name}`);
  }

  // Evaluate the declaration's expression (may recursively evaluate other constants)
  const value = evaluateExpression(decl.value, decls, cache);

  // Cache the result
  cache.set(name, { name, value, type: typeof value });
  return value;
}
```

**Circular Dependency Detection**:
- Track "currently evaluating" set during recursion
- If we encounter a constant already in the set → circular dependency error
- Example: `const A = B + 1; const B = A + 1;` → compile error

### 6. Backward Compatibility Strategy

**Question**: How do we ensure existing code still works after optimization?

**Decision**: **Always-On Optimization with Extensive Testing**

**Rationale**:
- Constant folding is **semantics-preserving** - output behavior should be identical
- No user-facing configuration needed (optimization is transparent)
- Comprehensive test suite ensures no regressions

**Testing Strategy**:
1. **Unit Tests**: Test constant map building, reference replacement, expression evaluation in isolation
2. **Integration Tests**: Full pipeline tests with before/after JSON comparison
3. **Regression Tests**: Run all existing Eligian test fixtures (SC-004: all must pass)
4. **Snapshot Tests**: Capture JSON output for typical programs, detect unexpected changes

**Validation Approach**:
```bash
# Before optimization (baseline)
npm run test:coverage:ci > baseline.json

# After optimization
npm run test:coverage:ci > optimized.json

# Compare (should be identical except for const-related changes)
diff baseline.json optimized.json
```

**Feature Flag** (if needed):
- Add `--no-optimize-constants` flag to CLI for debugging
- Default: enabled (always fold constants)
- Use case: Debugging generated JSON to see original constant references

---

## Design Decisions Summary

| Area | Decision | Alternatives Rejected |
|------|----------|----------------------|
| **Expression Evaluator** | Custom lightweight evaluator | `eval()` (unsafe), libraries (overkill), TS Compiler API (complex) |
| **Symbol Table** | `Map<string, ConstantValue>` | Nested maps (overkill), AST storage (unnecessary) |
| **Pipeline Placement** | Before optimizer, during transform | After optimizer (misses opportunities), separate pass (redundant traversal) |
| **Transitive Resolution** | Lazy evaluation with memoization | Topological sort (more complex), fail on dependencies (too restrictive) |
| **Backward Compatibility** | Always-on with extensive tests | Feature flag (adds complexity), opt-in (defeats purpose) |

---

## Implementation Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Compilation time regression** | Violates SC-003 (<10% increase) | Profile critical path, optimize map lookups, lazy evaluation |
| **Type mismatch errors** | Generate invalid JSON (string vs. number) | Preserve type information in `ConstantValue`, validate during replacement |
| **Circular dependencies** | Infinite loop during evaluation | Track "evaluating" set, detect cycles, throw compile error |
| **Incomplete constant detection** | Miss some constants, inconsistent behavior | Comprehensive AST traversal tests, validate all `ConstDeclaration` nodes captured |
| **Breaking existing tests** | Violates SC-004 (backward compat) | Run full test suite, snapshot tests, before/after JSON comparison |

---

## Next Steps (Phase 1)

1. Create `data-model.md` with detailed type definitions for `ConstantValue`, `ConstantMap`, `ExpressionEvaluationResult`
2. Create `quickstart.md` with step-by-step implementation guide
3. Update agent context with new technologies/patterns (lazy evaluation, AST traversal hooks)
4. Ready for task generation (`/speckit.tasks`)

---

## References

- [TypeScript Compiler Handbook - Checker](https://github.com/microsoft/TypeScript/wiki/Architectural-Overview#checker)
- [Rust Constant Evaluation RFC](https://rust-lang.github.io/rfcs/0911-const-fn.html)
- [LLVM Constant Folding](https://llvm.org/docs/LangRef.html#constant-expressions)
- [Compiler Design Book - Constant Propagation](https://en.wikipedia.org/wiki/Constant_folding)
