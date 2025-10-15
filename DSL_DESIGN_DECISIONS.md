# Eligian DSL Design Decisions

**Status**: In Progress
**Last Updated**: 2025-10-15
**Context**: Designing the Eligian language syntax based on actual Eligius operations

---

## Design Philosophy

The Eligian DSL aims to:
- **Reduce verbosity** of Eligius JSON configuration by 70-80%
- **Maintain clarity** through familiar syntax patterns
- **Support all 47 Eligius operations** without hardcoding specific ones
- **Enable rich IDE support** (autocomplete, hover hints, signature help)
- **Avoid syntactic sugar** that limits expressiveness

---

## Core Syntax Decisions

### 1. Action Definition Syntax

**Decision**: Use square brackets for operation lists, omit `operations:` label

**Rationale**: The context already makes it clear that actions contain operations. The `operations:` label adds unnecessary verbosity.

**Regular Actions**:
```eligian
action fadeIn [
  selectElement(".target")
  setStyle({ opacity: 0 })
  animate({ opacity: 1 }, 500)
]
```

**Endable Actions** (positional: start operations, then end operations):
```eligian
endable action showThenHide [
  selectElement(".box")
  addClass("visible")
] [
  removeClass("visible")
]
```

**Alternative Considered (Rejected)**:
```eligian
// Too verbose - explicit operation list label
action fadeIn {
  operations: [
    selectElement { selector: ".target" }
  ]
}

// Too verbose - explicit start/end labels
endable action showThenHide {
  start: [
    selectElement(".box")
  ]
  end: [
    removeClass("visible")
  ]
}
```

**Status**: ✅ Decided

---

### 2. Operation Call Syntax

**Decision**: Function invocation style instead of always using object literals

**Rationale**:
- More familiar to developers (looks like function calls)
- Less verbose for simple cases
- Parameter names/types shown via IDE (hover hints, autocomplete)
- Object literals still available for complex nested structures

**Examples**:
```eligian
// Single parameter
selectElement(".target")

// Multiple parameters
animate({ opacity: 1 }, 500, "easeInOut")

// Complex nested object
setStyle({ properties: { opacity: 0, color: "red" } })
```

**Alternative Considered (Rejected)**:
```eligian
// Always object literal - too verbose
selectElement { selector: ".target" }
animate { animationProperties: { opacity: 1 }, animationDuration: 500, animationEasing: "easeInOut" }
```

**Status**: ✅ Decided

---

### 3. Grammar Should Not Hardcode Operations

**Decision**: Grammar should support ANY operation systemName, not hardcode specific operations like `show`, `hide`, `animate`

**Rationale**:
- Eligius has 47 operations and may add more
- Hardcoding creates maintenance burden
- Syntactic sugar (like built-in actions) is too limiting
- Operations are just: `systemName` + `operationData` (parameters)

**Implementation**:
- Grammar allows arbitrary operation names
- IDE provides autocomplete/validation based on available operations
- Compiler validates operation existence and parameter types

**Status**: ✅ Decided (from initial user feedback)

---

## Open Questions

### Q1: Parameter Mapping Strategy ✅ DECIDED

**Question**: How do we map function-style parameters to operation properties?

**Decision**: Use positional parameters for all operations, rely on IDE support (signature help, hover hints, inlay hints) to show parameter names.

**Rules**:

1. **Exclude `@dependency` parameters** - Auto-injected from previous operations, never in function call
   ```typescript
   interface IAddClassOperationData {
     selectedElement: JQuery;  // @dependency - NOT in function call
     className: string;        // @required - IS in function call
   }
   ```

2. **Exclude `@output` parameters** - Set by operation, not provided by caller
   ```typescript
   interface ISelectElementOperationData {
     selector: string;           // @required - in function call
     selectedElement?: JQuery;   // @output - NOT in function call
   }
   ```

3. **Order parameters**: Required parameters first, then optional parameters
   ```eligian
   selectElement(".target")                                    // selector
   selectElement(".target", true)                              // selector, useSelectedElementAsRoot
   animate({ opacity: 1 }, 500)                                // animationProperties, animationDuration
   animate({ opacity: 1 }, 500, "ease")                        // animationProperties, animationDuration, animationEasing
   createElement("div", "Hello", { class: "box" })             // elementName, text, attributes
   ```

4. **Object literals for complex nested data** - Properties, attributes, etc. passed as objects naturally
   ```eligian
   setStyle({ opacity: 0, color: "red" })                      // properties object
   setData({ "operationdata.foo": 42 })                        // properties object
   ```

**IDE Support Requirements**:
- **Signature help**: Show parameter names and types as user types
- **Inlay hints**: Display parameter names next to values (e.g., `500 /* duration */`)
- **Hover documentation**: Show full operation signature and parameter descriptions
- **Autocomplete**: Suggest parameter values based on type

**Examples**:
```eligian
// Simple operations
selectElement(".target")
addClass("visible")
removeClass("hidden")
wait(1000)

// Multiple parameters
animate({ opacity: 1 }, 500, "ease")
calc(10, "+", 5)
reparentElement(".newParent")

// Complex nested objects
setStyle({ opacity: 0, color: "red", fontSize: "14px" })
createElement("div", "Content", { id: "box", class: "container" })
setData({ "operationdata.name": $context.currentItem, "globaldata.count": 42 })
```

**Status**: ✅ Decided

---

### Q2: Property Chain Reference Syntax ✅ DECIDED

**Question**: How do we distinguish literal strings from property chain references?

**Decision**: Use dollar sign (`$`) prefix for property chain references.

**Syntax**:
```eligian
setData({
  "operationdata.name": $context.currentItem,     // Reference - evaluates to runtime value
  "operationdata.message": "Hello World",         // Literal string
  "globaldata.count": 42                          // Literal number
})
```

**Property Chain Scopes**:
- `$context.*` - Runtime context (currentItem, loopIndex, loopLength, whenEvaluation, etc.)
- `$operationdata.*` - Data from previous operations in the current action
- `$globaldata.*` - Shared global data across all actions

**Examples**:
```eligian
// Simple references
setData({ "operationdata.name": $context.currentItem })

// Nested property access
setData({ "operationdata.title": $context.currentItem.name })

// Using in when conditions
when($operationdata.count > 5)

// Mixing references and literals
setData({
  "operationdata.value": $globaldata.userInput,
  "operationdata.message": "The value is stored",  // Literal string with "is" in it
  "operationdata.prefix": "context.currentItem"    // Literal string that looks like a reference
})
```

**Rationale**:
- Dollar sign is familiar from shell scripting, PHP, jQuery for variable references
- Visually distinct - immediately clear this is a reference, not a literal
- Allows literal strings containing "context.", "operationdata.", "globaldata."
- No ambiguity between references and literals

**Compiler Behavior**:
- `$context.foo` → Compile to property chain lookup in IOperationContext
- `$operationdata.foo` → Compile to property chain lookup in current operation data
- `$globaldata.foo` → Compile to property chain lookup in global data cache
- `"literal"` → Pass through as string literal
- `42` → Pass through as number literal

**Status**: ✅ Decided

---

### Q3: Nested Object Parameter Flattening ✅ DECIDED

**Question**: Should we flatten nested parameter objects for cleaner syntax?

**Decision**: Flatten all wrapper objects - compiler automatically wraps parameters in the required structure.

**Rationale**:
- Wrapper objects like `properties`, `attributes` are Eligius implementation details
- DSL should prioritize ergonomics over matching internal structure exactly
- This is exactly the verbosity reduction the DSL aims for (70-80% reduction)
- Compiler can automatically detect and wrap parameters based on operation signatures

**Examples**:

**Before (verbose)**:
```eligian
setStyle({ properties: { opacity: 0, color: "red", fontSize: "14px" } })
setElementAttributes({ attributes: { id: "box", class: "container" } })
setData({ properties: { "operationdata.name": $context.currentItem } })
```

**After (flattened)**:
```eligian
setStyle({ opacity: 0, color: "red", fontSize: "14px" })
setElementAttributes({ id: "box", class: "container" })
setData({ "operationdata.name": $context.currentItem })
```

**Operations affected**:
- `setStyle` - `properties` wrapper removed
- `setElementAttributes` - `attributes` wrapper removed
- `setData` - `properties` wrapper removed
- `setOperationData` - `properties` wrapper removed
- Any future operations with similar wrapper patterns

**Compiler behavior**:
1. Parse operation call with flattened parameters
2. Look up operation signature in Eligius operation interfaces
3. Detect wrapper object parameter (e.g., `properties: Record<...>`)
4. Automatically wrap parsed parameters in correct structure
5. Emit Eligius JSON with proper nesting

**Status**: ✅ Decided

---

### Q4: Timeline Action Invocation Syntax ✅ DECIDED

**Question**: How do actions get invoked on timelines?

**Decision**: Timelines accept only endable actions (with start/end operations). Support both named action invocation and inline action definition.

**Context**: Timelines work with time ranges (e.g., `at 0s..5s`), which map naturally to endable actions:
- Start operations execute at the beginning of the range (0s)
- End operations execute at the end of the range (5s)

**Syntax Options**:

**1. Named endable action invocation**:
```eligian
// Define endable action
endable action showThenHide [
  selectElement(".box")
  addClass("visible")
] [
  removeClass("visible")
]

// Use on timeline
timeline "main" using raf {
  at 0s..5s {
    showThenHide()  // Start ops at 0s, end ops at 5s
  }
}
```

**2. Inline endable action**:
```eligian
timeline "main" using raf {
  at 0s..5s [
    selectElement(".box")
    addClass("visible")
  ] [
    removeClass("visible")
  ]
}
```

**Benefits**:
- **Named actions**: Reusability across multiple timeline events
- **Inline actions**: Quick one-off effects without defining separate actions
- Consistent syntax between action definitions and timeline usage

**Examples**:
```eligian
// Mix named and inline
timeline "main" using raf {
  // Named action - reusable
  at 0s..2s {
    fadeIn()
  }

  at 3s..5s {
    fadeIn()  // Reuse same action
  }

  // Inline action - one-off effect
  at 6s..8s [
    selectElement(".title")
    setStyle({ fontSize: "24px" })
  ] [
    setStyle({ fontSize: "16px" })
  ]
}
```

**Note**: Regular actions (without start/end operations) are not used on timelines, as they have no time-range semantics. They can be used within operations that invoke actions (like `startAction`).

**Status**: ✅ Decided

---

## Implementation Notes

### IDE Support Requirements

To make function-style operation calls work, the IDE must provide:

1. **Autocomplete**: Show available operations with descriptions
2. **Signature Help**: Show parameter names, types, and order
3. **Hover Hints**: Show parameter documentation from Eligius operation interfaces
4. **Validation**: Check parameter types and required parameters

This data can be extracted from:
- Eligius TypeScript operation interfaces (`I*OperationData`)
- JSDoc comments on operations
- `@required`, `@dependency`, `@output` annotations

### Compiler Responsibilities

The compiler must:

1. **Parse function-style calls** → map to operation systemName + operationData
2. **Validate operation existence** against known Eligius operations
3. **Type-check parameters** against operation interfaces
4. **Handle property chain references** (resolve vs pass through)
5. **Inject dependency parameters** from previous operations in chain
6. **Emit correct Eligius JSON** with full IEngineConfiguration structure

---

## Next Steps

All core design questions (Q1-Q4) have been resolved! ✅

**Phase 1: Grammar Update**
1. Update `packages/language/src/eligian.langium` with new syntax:
   - Function-style operation calls with positional parameters
   - Dollar sign (`$`) property chain references
   - Square bracket action definitions (regular and endable)
   - Timeline inline and named action invocation

**Phase 2: Compiler Update**
2. Update AST transformer (`packages/compiler/src/ast-transformer.ts`):
   - Map function-style calls to operation systemName + operationData
   - Handle parameter flattening (unwrap `properties`, `attributes` wrappers)
   - Resolve property chain references (`$context.*`, `$operationdata.*`, `$globaldata.*`)
   - Inject `@dependency` parameters from previous operations

**Phase 3: Type System**
3. Create operation signature definitions for all 47 operations:
   - Extract from Eligius TypeScript interfaces
   - Define parameter order (required first, then optional)
   - Mark `@dependency` and `@output` parameters
   - Identify wrapper objects for flattening

**Phase 4: IDE Support**
4. Build IDE features:
   - Autocomplete for operation names and parameters
   - Signature help showing parameter names/types
   - Hover hints with operation documentation
   - Validation for parameter types and required parameters
   - Inlay hints for parameter names

**Phase 5: Testing**
5. Update test suite:
   - Update DSL fixtures with new syntax
   - Test operation call compilation
   - Test property chain resolution
   - Test parameter flattening
   - Test action definitions and invocations

---

## References

- [ELIGIUS_OPERATIONS_REFERENCE.md](./ELIGIUS_OPERATIONS_REFERENCE.md) - Complete list of 47 operations
- [CLAUDE.md](./CLAUDE.md) - Project overview and architecture
- [.specify/memory/constitution.md](../.specify/memory/constitution.md) - Project principles
