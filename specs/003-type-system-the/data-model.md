# Data Model: Typir-Based Type System

**Feature**: Robust Type System with Typir Integration
**Date**: 2025-10-19
**Branch**: `003-type-system-the`

## Overview

This document describes the conceptual data model for the Typir-based type system. Unlike a traditional data model with entities and relationships, the type system model describes the **type graph** structure and **type-related metadata** managed by Typir.

---

## Type Graph Structure

### Core Entity: Type

All types in the Typir type system are nodes in a type graph.

**Properties**:
- `identifier`: string (unique) - Internal tracking ID
- `name`: string - Human-readable name shown in error messages
- `kind`: TypeKind - Classification of the type (Primitive, Function, Class, Top, Bottom, etc.)

**Types in Eligian Type System**:

| Type Name | Kind | Identifier Pattern | Purpose |
|-----------|------|-------------------|---------|
| `string` | Primitive | `primitive-string` | String literals, selectors, CSS values |
| `number` | Primitive | `primitive-number` | Numeric literals (durations, offsets) |
| `boolean` | Primitive | `primitive-boolean` | Boolean literals (true, false) |
| `object` | Primitive | `primitive-object` | Object literals ({key: value}) |
| `array` | Primitive | `primitive-array` | Array literals ([1, 2, 3]) |
| `unknown` | Top | `top-unknown` | Unknown type (opt-out of type checking) |
| Operations (100+) | Function | `function-{opName}` | Eligius operations (selectElement, animate, etc.) |

### Relationships: Type Graph Edges

**Conversion Edges**:
- Represent type conversion rules (implicit coercion or explicit casting)
- Direction: From source type → To target type
- Eligian currently has **no conversions** (strict type matching)

**Subtyping Edges** (not currently used):
- Represent subtype relationships (e.g., `number` is a subtype of `any`)
- Direction: From subtype → To supertype
- Could be used in future for advanced type features

---

## Type Inference Metadata

### Inference Rule

Connects language nodes (AST elements) to Typir types.

**Properties**:
- `filter`: (node: AstNode) => boolean - Type guard for matching nodes
- `languageKey`: string - AST node type ($type property) for performance
- `matching`: (node, context) => boolean - Additional condition
- `validation`: (node, accept, typir) => void - Optional validation logic

**Inference Rules in Eligian**:

| Language Node | Inferred Type | Inference Rule |
|---------------|---------------|----------------|
| `StringLiteral` | `string` | Filter: `isStringLiteral` |
| `NumberLiteral` | `number` | Filter: `isNumberLiteral` |
| `BooleanLiteral` | `boolean` | Filter: `isBooleanLiteral` |
| `ObjectLiteral` | `object` | Filter: `isObjectLiteral` |
| `ArrayLiteral` | `array` | Filter: `isArrayLiteral` |
| `TypeAnnotation (: string)` | `string` | Matching: `node.type === 'string'` |
| `TypeAnnotation (: number)` | `number` | Matching: `node.type === 'number'` |
| `OperationCall (selectElement)` | Function return type | Matching: `node.operationName === 'selectElement'` |
| `VariableReference (@myVar)` | Variable's declared type | Lookup: `varRef.variable.ref` |
| `ParameterReference (@@param)` | Parameter's declared type | Lookup: `paramRef.parameter.ref` |

### Type Constraint (Internal to Inference)

Represents a type requirement collected during type inference.

**Properties**:
- `parameter`: string - Name of the parameter being constrained
- `expectedType`: Type - Type required by operation usage
- `source`: string - Source of constraint (operation name)
- `location`: SourceLocation - Where constraint was collected

**Example**:
```eligian
action fadeIn(selector, duration) [
  selectElement(selector)         // Constraint: selector must be 'string'
  animate({opacity: 1}, duration) // Constraint: duration must be 'number'
]
```

Constraints:
```typescript
[
  { parameter: 'selector', expectedType: stringType, source: 'selectElement', location: {...} },
  { parameter: 'duration', expectedType: numberType, source: 'animate', location: {...} }
]
```

---

## Validation Metadata

### Validation Rule

Defines a type-related check to perform on specific AST nodes.

**Properties**:
- `astNodeType`: string - AST node type to validate
- `validationFunction`: (node, accept, typir) => void - Validation logic

**Validation Rules in Eligian**:

| AST Node Type | Validation Check | Error Condition |
|---------------|------------------|-----------------|
| `VariableDeclaration` | Type annotation matches initial value type | Incompatible types |
| `OperationCall` | Argument types match operation parameter types | Type mismatch |
| Parameter/variable references | Used type matches declared type | Type mismatch |

### Type Error

Represents a type validation failure.

**Properties**:
- `code`: string - Error code (e.g., `TYPE_MISMATCH`, `TYPE_CONFLICT`)
- `message`: string - Human-readable error message
- `hint`: string (optional) - Suggestion for fixing the error
- `location`: SourceLocation - Source location of the error
- `severity`: 'error' | 'warning' | 'info' | 'hint'

**Error Templates**:

| Code | Message Template | Hint Template |
|------|------------------|---------------|
| `TYPE_MISMATCH` | `Cannot use '{actual}' where '{expected}' is expected` | `Expected type '{expected}', but got '{actual}'` |
| `TYPE_CONFLICT` | `Parameter has conflicting type requirements: {type1} vs {type2}` | `Used as different types in: {source1}, {source2}` |
| `UNKNOWN_OPERATION` | `Unknown operation: "{operationName}"` | `Available operations: {suggestions}` |

### Source Location

Pinpoints where an error occurred in the source code.

**Properties**:
- `line`: number - Line number (1-indexed)
- `column`: number - Column number (0-indexed)
- `length`: number - Length of the problematic text
- `uri`: string - Document URI (from Langium)

---

## Operation Metadata

### Operation Signature (from Registry)

Metadata about an Eligius operation used for type checking.

**Properties**:
- `systemName`: string - Operation name (e.g., `selectElement`)
- `parameters`: OperationParameter[] - Input parameters
- `dependencies`: DependencyInfo[] - Required outputs from previous operations
- `outputs`: OutputInfo[] - Values produced by this operation
- `description`: string - Human-readable description

### Operation Parameter

Metadata about a single operation parameter.

**Properties**:
- `name`: string - Parameter name (e.g., `selector`, `className`)
- `type`: ParameterType[] | ConstantValue[] - Semantic types or allowed values
- `required`: boolean - Whether parameter is required
- `defaultValue`: unknown (optional) - Default value if optional
- `description`: string (optional) - Parameter purpose
- `erased`: boolean (optional) - Whether parameter is erased after execution

**Type Mapping**: ParameterType → EligianType (Typir Type)

| ParameterType | Typir Type | Rationale |
|---------------|------------|-----------|
| `ParameterType:string` | `string` | String literals, selectors |
| `ParameterType:selector` | `string` | CSS selectors |
| `ParameterType:className` | `string` | CSS class names |
| `ParameterType:number` | `number` | Numeric values |
| `ParameterType:dimensions` | `number` | Width/height values |
| `ParameterType:boolean` | `boolean` | Boolean flags |
| `ParameterType:object` | `object` | Object literals |
| `ParameterType:jQuery` | `object` | jQuery objects |
| `ParameterType:array` | `array` | Array literals |
| `ConstantValue` (enum) | `string` | Enum-like constant values |
| Unknown types | `unknown` | Unrecognized parameter types |

---

## Type Environment

Tracks variable and parameter types through code sequences.

**Properties**:
- `types`: Map<string, Type> - Variable/parameter name → inferred type

**Operations**:
- `addVariable(name, type)`: Record a variable's type
- `getVariableType(name)`: Look up a variable's type
- `hasVariable(name)`: Check if variable is tracked
- `clone()`: Create copy for branching contexts (if/else, for loops)

**Usage**:
```typescript
// Track variable types through sequences
const env = new TypeEnvironment();
env.addVariable('myVar', stringType);

// Clone for branching
const ifEnv = env.clone();  // Independent environment for if block
const elseEnv = env.clone(); // Independent environment for else block
```

---

## Document-Type Association

Typir tracks which types belong to which documents for lifecycle management.

**Properties**:
- `documentKey`: string - Document URI
- `types`: Type[] - Types created for this document

**Lifecycle Events**:

| Event | Action | Effect |
|-------|--------|--------|
| Document added | Create types for all AST nodes | Types associated with document |
| Document updated | Remove old types, create new types | Old types invalidated, new types added |
| Document deleted | Remove all types from document | Types removed from type graph |

**Constant Types** (defined in `onInitialize()`):
- Not associated with any document
- Never invalidated
- Examples: `string`, `number`, operation function types

**User-Dependent Types** (defined in `onNewAstNode()`):
- Associated with the document that contains the AST node
- Automatically invalidated when document changes
- Examples: User-defined classes, functions (not applicable to Eligian currently)

---

## Caching Model

### Inference Cache

Caches inferred types for AST nodes to avoid redundant computation.

**Key**: `(documentKey, astNode)`
**Value**: `Type | CachePending`

**Cache States**:
- `undefined`: Not yet inferred
- `CachePending`: Inference in progress (prevents infinite recursion)
- `Type`: Successfully inferred type

**Invalidation**:
- Automatic via Langium's `DocumentCache`
- Tied to `DocumentState.IndexedReferences` (invalidates when references change)

### Operation Type Cache

Caches expected parameter types for operations to avoid registry lookups.

**Key**: `operationName` (string)
**Value**: `Map<parameterName, Type>`

**Cache Behavior**:
- Populated on first lookup per operation
- Never invalidated (operation registry is static)
- O(1) lookup after first query

---

## State Transitions

### Type System Initialization

```
[Langium Services Created]
         ↓
[initializeLangiumTypirServices called]
         ↓
[onInitialize() triggered]
         ↓
[Primitive types created]
         ↓
[Operation function types created]
         ↓
[Global inference rules registered]
         ↓
[Global validation rules registered]
         ↓
[Type system READY]
```

### Document Processing

```
[Document added/updated]
         ↓
[Langium parses document → new AST]
         ↓
[Langium reaches ComputedScopes phase]
         ↓
[Typir notified: handleProcessedDocument()]
         ↓
[Old types invalidated (if update)]
         ↓
[onNewAstNode() called for each AST node]
         ↓
[New types created and associated with document]
         ↓
[Types available for validation]
```

### Type Inference

```
[AST node needs type]
         ↓
[Check inference cache]
         ↓ (cache miss)
[Mark as CachePending]
         ↓
[Evaluate inference rules in order]
         ↓ (rule matches)
[Infer type from rule]
         ↓ (recursive inference if needed)
[Cache inferred type]
         ↓
[Return type]
```

### Validation

```
[Document validation requested]
         ↓
[beforeDocument validation hook]
         ↓
[For each AST node:]
  [Check validation rules for node type]
  [Infer types for node and related nodes]
  [Check type constraints]
  [Report errors via ValidationAcceptor]
         ↓
[afterDocument validation hook]
         ↓
[Errors displayed in IDE Problems panel]
```

---

## Relationships Summary

```
Type Graph:
  Type ─[conversion]─> Type
  Type ─[subtyping]─> Type

Type ← Inference Rule → AST Node
Type ← Validation Rule → AST Node
Type ← Operation Signature → Operation Parameter

Document → Type[] (association)
AST Node → Type (inferred, cached)
Operation → Function Type (1:1 mapping)
ParameterType → Typir Type (n:1 mapping)
```

---

## Constraints and Invariants

1. **Type Uniqueness**: Each type must have a unique identifier
2. **Inference Determinism**: Same AST node always infers same type (given same context)
3. **Unknown Compatibility**: `unknown` type is assignable to/from ALL types
4. **Document Association**: User-defined types MUST be associated with a document
5. **Primitive Immutability**: Primitive types (string, number, etc.) are never invalidated
6. **Cache Consistency**: Inferred types invalidated when document changes
7. **Operation Registry Stability**: Registry is static after initialization
8. **Validation Order**: Types must be inferred before validation can proceed

---

## Performance Characteristics

| Operation | Time Complexity | Space Complexity | Notes |
|-----------|-----------------|------------------|-------|
| Type lookup by identifier | O(1) | - | Hash map lookup |
| Inference rule matching | O(n) | - | n = number of registered rules |
| Type inference (cached) | O(1) | - | Cache hit |
| Type inference (uncached) | O(d) | O(d) | d = AST depth (recursive inference) |
| Validation | O(n) | - | n = number of AST nodes |
| Document invalidation | O(t) | - | t = types in document |
| Operation type lookup (cached) | O(1) | - | Cache hit |
| Operation type lookup (uncached) | O(p) | O(p) | p = parameters in operation |

---

## Future Extensions

### Possible Type System Enhancements

1. **Union Types**: `string | number` for multi-type parameters
2. **Generic Types**: `Array<T>` for typed arrays
3. **User-Defined Types**: `type Selector = string` for type aliases
4. **Structural Typing**: Deep object shape matching
5. **Type Narrowing**: Conditional type refinement in if blocks
6. **Strict Null Checking**: Separate `null` and `undefined` types

### Model Changes Required

- **Union Type Entity**: New kind of type with multiple constituent types
- **Generic Type Entity**: Type with type parameters
- **Type Alias Entity**: Named reference to another type
- **Structural Type Entity**: Type defined by shape rather than name
- **Null Type Entity**: Separate type for null values
