# Typir Type System Integration

**Status**: Active (Phase 3 Complete - US1)
**Framework**: [Typir](https://github.com/TypeFox/typir) + [Typir-Langium](https://github.com/TypeFox/typir-langium)

---

## Overview

This directory contains the Typir-based type system for Eligian DSL. Typir provides principled type checking, inference, and validation integrated with Langium language services.

**Why Typir?**
- Battle-tested framework for language type systems
- Automatic type inference with constraint solving
- Built-in validation and error reporting
- Langium integration for IDE support
- Compositional type system design

---

## Architecture

### Core Files

- **`eligian-type-system.ts`**: Main type system definition (`EligianTypeSystem` class)
- **`eligian-specifics.ts`**: Eligian-specific type interfaces and configurations
- **`index.ts`**: Public exports

### Type System Phases

**Phase 1**: Primitive types (string, number, boolean, object, array, unknown)
**Phase 2**: Operation function types (loaded from OPERATION_REGISTRY)
**Phase 3**: Validation rules (variable assignments, operation calls)
**Future**: User-defined action types, parameter inference

---

## Type System Features

### Primitive Types

| Type | Inferred From | Example |
|------|---------------|---------|
| `string` | `StringLiteral` | `"hello"` |
| `number` | `NumberLiteral` | `42`, `3.14` |
| `boolean` | `BooleanLiteral` | `true`, `false` |
| `object` | `ObjectLiteral` | `{opacity: 1}` |
| `array` | `ArrayLiteral` | `[1, 2, 3]` |
| `unknown` | Top type | Untyped parameters |

### Operation Type Checking

Operation calls are validated against signatures from `OPERATION_REGISTRY`:

```eligian
// ✅ Correct types
selectElement("#box")      // selector: string
animate({opacity: 1}, 500) // properties: object, duration: number

// ❌ Type errors
selectElement(123)         // ERROR: expects string, got number
animate({opacity: 1}, "slow") // ERROR: expects number, got string
```

### Parameter Type Annotations

Optional type annotations on action parameters:

```eligian
action fadeIn(selector: string, duration: number) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, $operationdata.duration)
]

// Type-checked at call site (future US4):
timeline "test" in "#app" using raf {
  at 0s..1s { fadeIn("#box", 500) }    // ✅ Correct
  at 1s..2s { fadeIn(123, "slow") }    // ❌ Both args wrong type
}
```

### Gradual Typing

Type checking is **opt-in**. Untyped code works unchanged:

```eligian
// No annotations - no type checking
action demo(selector, duration) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, $operationdata.duration)
]
```

---

## Implementation Status

### ✅ Completed (Phase 3 - US1)

- [x] Primitive type inference (string, number, boolean, object, array, unknown)
- [x] Operation function types from registry
- [x] Operation call argument validation
- [x] Variable type checking (const declarations)
- [x] Type error reporting in IDE (red squiggles, hover messages)
- [x] Backward compatibility (all 346 tests passing)

### ⏳ Future Features

- [ ] **US2**: Type-aware code completion
- [ ] **US3**: Parameter type inference from usage
- [ ] **US4**: Action call type validation (cross-reference checking)
- [ ] **US5**: Gradual typing verification
- [ ] **US6**: Control flow type checking (if/else, for loops)

---

## Integration Points

### Langium Module (`eligian-module.ts`)

```typescript
import { createTypirLangiumServices, initializeLangiumTypirServices } from 'typir-langium';
import { EligianTypeSystem } from './type-system-typir/eligian-type-system.js';

// Add Typir service
typir: () => createTypirLangiumServices(shared, reflection, new EligianTypeSystem(), {})

// Initialize after service creation
initializeLangiumTypirServices(Eligian, Eligian.typir);
```

### Type System Lifecycle

1. **Initialization**: `onInitialize()` creates primitive types and operation function types
2. **AST Processing**: `onNewAstNode()` handles user-defined types (currently no-op)
3. **Validation**: Typir validates type constraints automatically
4. **Error Reporting**: Langium displays type errors in IDE

---

## Local Typir Documentation

**Location**: `f:/projects/typir/`

The local Typir repository contains documentation, examples, and API reference for understanding Typir internals.

**Key Resources**:
- `typir/README.md` - Overview and getting started
- `typir/docs/` - Detailed documentation
- `typir-langium/` - Langium integration examples

---

## Testing

### Unit Tests

Type system logic tested in isolation (future):
- Primitive type inference
- Operation type mappings
- Validation rules

### Integration Tests

Full type checking in Eligian programs:
- `packages/language/src/__tests__/validation.spec.ts` - Type validation integration
- Examples: `examples/type-checking-manual-test.eligian`

### Manual Testing

VS Code extension testing:
- Open `.eligian` file in VS Code
- Verify red squiggles on type mismatches
- Check hover messages show expected vs actual types
- Confirm Problems panel lists all errors

---

## Migration from Custom Type System

**Previous**: Custom type system in `packages/language/src/type-system/`
**Current**: Typir-based system in `packages/language/src/type-system-typir/`

**Changes**:
- Removed custom constraint collection/unification logic
- Removed custom type environment tracking
- Removed custom validation methods from `eligian-validator.ts`
- Typir handles all type inference and validation

**Benefits**:
- More robust type inference (constraint solver)
- Better error messages (Typir framework)
- Easier to extend (compositional design)
- Industry-standard approach (TypeFox Typir)

---

## Troubleshooting

### Type Errors Not Showing in IDE

1. Check language server is running (VS Code Output → Eligian Language Server)
2. Verify Typir initialization: Add logging in `onInitialize()`
3. Check operation registry loaded: Verify `OPERATION_REGISTRY` import

### Incorrect Type Errors

1. Check operation metadata in `registry.generated.ts`
2. Verify parameter type mapping in `mapParameterTypeToTypirType()`
3. Check primitive type inference rules match AST nodes

### Performance Issues

1. Profile type checking overhead (< 50ms target)
2. Check if validation rules run multiple times
3. Verify Typir caching is enabled

---

## References

- [Typir GitHub](https://github.com/TypeFox/typir)
- [Typir-Langium GitHub](https://github.com/TypeFox/typir-langium)
- [Local Typir Docs](f:/projects/typir/)
- [Eligian Language Spec](../../../LANGUAGE_SPEC.md)
