# Type System

This directory contains the optional static type checking system for the Eligian DSL (Phase 18).

## Overview

The Eligian type system provides **optional** TypeScript-style type checking to catch type mismatches at compile time. It supports:

1. **Type Annotations** (US1): Explicit type hints for self-documentation
2. **Type Checking** (US2): Catch type errors before running timelines
3. **Type Inference** (US3): Automatically infer types from operation usage

## Architecture

### Core Modules

#### `types.ts`
Defines core type system types:
- `EligianType`: The 5 primitive types (`string`, `number`, `boolean`, `object`, `array`, `unknown`)
- `TypeConstraint`: Represents a type requirement from operation usage
- `TypeError`: Represents a type validation error with location and hint

#### `inference.ts`
Type inference and constraint collection:
- `inferLiteralType()`: Infer type from literal expressions
- `collectParameterConstraints()`: Collect type requirements from operation calls
- `unifyConstraints()`: Combine constraints into single type or error
- `inferParameterTypes()`: Full type inference for action parameters
- `getOperationParameterTypes()`: Query operation registry for expected types
- `TypeEnvironment`: Track variable types through operation sequences

#### `validator.ts`
Type compatibility checking:
- `validateTypeCompatibility()`: Check if actual type matches expected type
- Returns `null` for compatible types, `TypeError` for mismatches
- Provides clear error messages with hints

#### `index.ts`
Public API - exports all type system functionality

## Usage

### Type Annotations (US1)

Add explicit type annotations to action parameters for self-documentation:

```eligian
action fadeIn(selector: string, duration: number, easing: string) [
  selectElement(selector)
  animate({opacity: 1}, duration, easing)
]
```

**Supported Types**:
- `string` - String literals, selectors, CSS values
- `number` - Numeric values (durations, offsets, coordinates)
- `boolean` - Boolean values (true/false)
- `object` - Object literals
- `array` - Array literals

### Type Checking (US2)

Type checking runs automatically during validation. It catches:

1. **Operation argument type mismatches**:
   ```eligian
   action bad(selector: number) [
     selectElement(selector)  // ❌ Error: selector is number, selectElement expects string
   ]
   ```

2. **Variable declaration type mismatches**:
   ```eligian
   action bad(duration: string) [
     const delay = 1000
     animate({opacity: 1}, duration)  // ❌ Error: duration is string, animate expects number
   ]
   ```

3. **Variable reference type mismatches**:
   ```eligian
   action bad() [
     const selector = "#box"
     animate({opacity: 1}, @selector)  // ❌ Error: selector is string, animate expects number
   ]
   ```

### Type Inference (US3)

Parameters without type annotations are automatically inferred from usage:

```eligian
// No annotations needed!
action fadeIn(selector, duration) [
  selectElement(selector)         // selector inferred as 'string'
  animate({opacity: 1}, duration) // duration inferred as 'number'
]
```

**Inference Rules**:
1. Collect type constraints from all operation calls
2. If all constraints agree → use that type
3. If constraints conflict → report error
4. If no constraints → type remains 'unknown' (no type checking)

**Explicit Annotations Take Precedence**:
```eligian
action mixed(selector: string, duration) [  // selector explicit, duration inferred
  selectElement(selector)
  animate({}, duration)  // duration inferred as 'number'
]
```

## Integration with Validation

The type system integrates with the existing validation pipeline in `eligian-validator.ts`:

### Action-Level Validation
- `checkTypeAnnotationsInAction()`: Entry point for regular actions
- `checkTypeAnnotationsInStartOps()`: Entry point for endable action start operations
- `checkTypeAnnotationsInEndOps()`: Entry point for endable action end operations
- Similar methods for inline actions

### Type Checking Flow
1. **Collect type annotations**: Extract explicit annotations + infer missing types
2. **Build TypeEnvironment**: Initialize environment with parameter types
3. **Walk operation sequence**: Process each statement (operations, if/else, for loops)
4. **Track variable types**: Update environment as variables are declared
5. **Check operation calls**: Validate arguments against expected types
6. **Check variable/parameter references**: Validate usage against declared types

### TypeEnvironment
The `TypeEnvironment` class tracks variable and parameter types through operation sequences:
- `addVariable(name, type)`: Add variable to environment
- `getVariableType(name)`: Get variable type
- `clone()`: Clone environment for branching (if/else, for loops)

## Design Decisions

### Opt-In Type Checking
The type system is **completely optional**:
- Actions without type annotations work exactly as before
- Type annotations are parsed but ignored at runtime
- 100% backwards compatibility maintained

### Unknown Type
The special `'unknown'` type opts out of type checking:
- Parameters with no annotation and no usage remain unknown
- Unknown types are compatible with everything
- No errors for unknown → any type or any type → unknown

### Error Recovery
The type system is designed to be resilient:
- Missing operation types don't block checking other parameters
- Type inference failures don't cascade
- Validation continues even after type errors

### Performance
Type checking adds minimal overhead:
- Constraint collection runs once per action
- Type environment uses efficient Map data structure
- Operation registry queries are fast (Map lookup)
- No impact on runtime performance (checking is compile-time only)

## Testing

### Test Organization
- `packages/language/src/__tests__/type-system.spec.ts`: Integration tests
- `packages/language/src/__tests__/validation.spec.ts`: Type annotation collection tests

### Test Coverage
- **20 integration tests** (type-system.spec.ts)
  - Type annotations (10 tests)
  - Type inference (8 tests)
  - Backwards compatibility (2 tests)
- **5 validation tests** (validation.spec.ts)
  - Type annotation collection
  - Mixed typed/untyped parameters
  - All primitive types

### Example Files
- `examples/type-annotation-test.eligian`: Type annotation syntax examples
- `examples/type-error-demo.eligian`: Type error demonstration
- `examples/type-inference-demo.eligian`: Type inference examples

## Implementation Status

### Completed Features ✅
- [X] Type annotation syntax (T292)
- [X] Type annotation parsing tests (T293)
- [X] Type annotation collection (T294)
- [X] Type compatibility validation (T295-T298)
- [X] Operation call type checking (T299-T300)
- [X] Variable declaration type checking (T301)
- [X] Variable reference type checking (T302)
- [X] Parameter reference type checking (T303)
- [X] Integration with action validation (T304)
- [X] Comprehensive type checking tests (T305-T307)
- [X] Constraint collection (T308)
- [X] Constraint unification (T309)
- [X] Full parameter type inference (T310)
- [X] Inference validation integration (T311)
- [X] Type inference tests (T312-T313)

### Future Enhancements (Not Planned)
- Union types (string | number)
- Generic types (Array<string>)
- Custom type definitions
- Type aliases
- Nominal types

## Contributing

When modifying the type system:

1. **Maintain backwards compatibility** - All untyped code must continue to work
2. **Add tests** - Every feature needs integration tests
3. **Update documentation** - Keep this README and JSDoc comments current
4. **Run Biome** - Ensure code quality with `npm run check`
5. **Profile performance** - Type checking should be fast (<50ms overhead)

## References

- Constitution: `.specify/memory/constitution.md`
- Grammar: `packages/language/src/eligian.langium`
- Validator: `packages/language/src/eligian-validator.ts`
- Operation Registry: `packages/language/src/compiler/operations/registry.ts`
