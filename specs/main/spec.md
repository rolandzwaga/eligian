# Feature Specification: Type System Enhancements (Phase 18)

## Overview

Add optional static type checking to the Eligian DSL to catch type errors at compile time instead of runtime. This provides TypeScript-style type safety without requiring full type annotations everywhere.

## Motivation

Currently, the Eligian compiler validates:
- Operation signatures (correct number/names of parameters)
- Operation dependencies (required properties available)
- Erased property access (data flow analysis)

However, it does NOT validate:
- Type compatibility (passing a number where a string selector is expected)
- Variable type consistency (using @duration where a selector is needed)
- Parameter type mismatches in action calls

This leads to errors that are only caught at runtime by Eligius, or worse, silent failures.

## Goals

1. **Optional Type Annotations**: Allow developers to add type hints to action parameters
2. **Type Inference**: Automatically infer types from usage without annotations
3. **Compile-Time Validation**: Catch type mismatches before running the timeline

## Non-Goals

- Full dependent type system
- Generics or advanced type features
- Property chain type checking (already handled by cross-references)
- Breaking changes to existing valid code

## User Stories

### Story 1: Type Annotations for Self-Documentation

**As a** developer writing reusable actions
**I want to** annotate parameter types
**So that** users know what types to pass and get autocomplete help

```eligian
// Before (no type info)
action fadeIn(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

// After (with type annotations)
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

### Story 2: Catch Type Errors at Compile Time

**As a** developer using the DSL
**I want** compile-time errors for type mismatches
**So that** I catch bugs before running the timeline

```eligian
const duration = 500
const selector = "#title"

action demo [
  // ❌ Compile error: Cannot pass number to selectElement (expects string)
  selectElement(@duration)

  // ❌ Compile error: Cannot pass string to animate duration (expects number)
  animate({opacity: 1}, @selector)
]
```

### Story 3: Type Inference Without Annotations

**As a** developer
**I want** type checking without writing types everywhere
**So that** I get safety without verbosity

```eligian
// No type annotations needed
action highlight(item) [
  // Compiler infers: item must be string (selector)
  // because addClass expects string selector
  addClass(item, "highlight")
]

// ❌ Compile error caught automatically
const count = 10
highlight(@count)  // Error: Cannot pass number where string expected
```

## Technical Requirements

### R1: Type Annotation Syntax

Support optional type annotations on action parameters:

```eligian
action name(param1: type1, param2: type2) [
  // body
]
```

Supported types:
- `string` - String values and selectors
- `number` - Numeric values (durations, offsets, etc.)
- `boolean` - Boolean values
- `object` - Object literals
- `array` - Array literals

### R2: Type Inference

Infer parameter types from usage:

```eligian
action demo(selector) [
  // Use of selector in selectElement(selector: string)
  // => Infer selector: string
  selectElement(selector)
]
```

Inference rules:
1. Parameter used in operation → infer from operation signature
2. Variable assigned literal → infer from literal type
3. Multiple usages → must be compatible with all uses

### R3: Type Checking

Validate type compatibility:

1. **Variable declarations**: Infer type from initializer
2. **Parameter references**: Check against action parameter type
3. **Operation arguments**: Validate against operation signature
4. **Variable references**: Check against declared/inferred type

### R4: Error Messages

Provide clear, actionable error messages:

```
Error: Type mismatch in operation call
  at demo.eligian:5:3

  selectElement(@duration)
  ^^^^^^^^^^^^^^^^^^^^^^^^

  Cannot pass 'number' to parameter 'selector' (expected 'string')

  Hint: @duration was declared as number on line 1
```

### R5: Backwards Compatibility

All existing valid Eligian code must continue to work without modifications.

Type annotations are optional - code without them should work exactly as before.

## Design Constraints

1. **Langium Integration**: Use Langium's validation framework
2. **Progressive Enhancement**: Type checking is additive, not breaking
3. **Performance**: Type checking should not significantly slow compilation
4. **VS Code Support**: Type errors should show as red squiggles in IDE

## Success Criteria

1. ✅ Type annotations parse correctly in grammar
2. ✅ Type inference works for common patterns
3. ✅ Type errors show in VS Code Problems panel
4. ✅ All existing tests pass (no breaking changes)
5. ✅ New tests cover type checking scenarios
6. ✅ Documentation explains type system usage

## Out of Scope

- Runtime type checking (Eligius handles this)
- Advanced types (unions, intersections, generics)
- Type aliases or custom types
- Structural typing (duck typing)
- Gradual typing migration tools

## Examples

### Example 1: Typed Action with Inference

```eligian
// Explicit types on action
action fadeElement(selector: string, duration: number, opacity: number) [
  selectElement(selector)
  animate({opacity: opacity}, duration)
]

// Variable type inferred from literal
const speed = 300  // Inferred as number

// ✅ Valid - types match
fadeElement("#title", @speed, 1.0)

// ❌ Error - type mismatch
fadeElement(@speed, "#title", 1.0)
```

### Example 2: Type Inference from Operations

```eligian
// No type annotations
action highlightItem(item) [
  // addClass expects (selector: string, className: string)
  // => Infer item: string
  addClass(item, "active")
]

const element = ".card"  // Inferred as string
highlightItem(@element)  // ✅ Valid

const index = 5  // Inferred as number
highlightItem(@index)  // ❌ Error: Cannot pass number to string parameter
```

### Example 3: Mixed Typed and Untyped Code

```eligian
// Untyped action (legacy code)
action oldAction(x) [
  selectElement(x)
]

// Typed action (new code)
action newAction(selector: string) [
  oldAction(selector)  // ✅ Valid - type flows through
]

const num = 42
newAction(@num)  // ❌ Error - type error caught even in mixed code
```

## Dependencies

- Langium validation framework
- Operation registry with parameter type information
- Cross-reference resolution (already implemented in Phase 16.8)

## References

- TypeScript type inference: https://www.typescriptlang.org/docs/handbook/type-inference.html
- Langium validation: https://langium.org/docs/reference/validation/
- Existing operation registry: `packages/language/src/compiler/operations/registry.ts`
