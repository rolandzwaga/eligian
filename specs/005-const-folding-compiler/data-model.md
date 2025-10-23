# Data Model: Constant Folding Optimization

**Feature**: Constant Folding Optimization
**Branch**: `005-const-folding-compiler`
**Date**: 2025-01-23

## Overview

This document defines the data structures used to represent constants, their values, and expression evaluation results during the constant folding optimization process.

---

## Core Types

### 1. ConstantValue

Represents a resolved constant with its name, value, and type information.

```typescript
interface ConstantValue {
  /**
   * The constant's identifier name
   * @example "MESSAGE", "DELAY", "FLAG"
   */
  name: string;

  /**
   * The constant's resolved literal value
   * Must be a JavaScript primitive (string, number, or boolean)
   */
  value: string | number | boolean;

  /**
   * The constant's type (for type preservation during inlining)
   */
  type: 'string' | 'number' | 'boolean';

  /**
   * Source location (for error reporting)
   * Optional - used for generating helpful compiler errors
   */
  sourceLocation?: {
    line: number;
    column: number;
    file: string;
  };
}
```

**Usage**:
- Stored in `ConstantMap` after evaluating a `const` declaration
- Used during reference replacement to inline the correct literal value
- Type information ensures string `"5"` is not confused with number `5`

**Example**:
```typescript
const messageConstant: ConstantValue = {
  name: 'MESSAGE',
  value: 'hello',
  type: 'string',
  sourceLocation: { line: 1, column: 7, file: 'example.eligian' }
};
```

---

### 2. ConstantMap

A map from constant names to their resolved values. Built during AST traversal.

```typescript
type ConstantMap = Map<string, ConstantValue>;
```

**Properties**:
- **Key**: Constant name (string)
- **Value**: `ConstantValue` object
- **Scope**: Global only (MVP - no nested scopes)
- **Immutability**: Map is built once during AST traversal, then read-only during transformation

**Lifecycle**:
1. **Build Phase**: During AST traversal, populate map by evaluating `const` declarations
2. **Replace Phase**: During transformation, use map to replace variable references
3. **Cleanup**: Map is discarded after compilation (not persisted)

**Example**:
```typescript
const constantMap: ConstantMap = new Map([
  ['MESSAGE', { name: 'MESSAGE', value: 'hello', type: 'string' }],
  ['DELAY', { name: 'DELAY', value: 1000, type: 'number' }],
  ['ENABLED', { name: 'ENABLED', value: true, type: 'boolean' }]
]);
```

---

### 3. ExpressionEvaluationResult

Result of attempting to evaluate a constant expression at compile time.

```typescript
interface ExpressionEvaluationResult {
  /**
   * Whether the expression could be successfully evaluated
   */
  canEvaluate: boolean;

  /**
   * The evaluated value (if canEvaluate is true)
   * undefined if evaluation failed
   */
  value?: string | number | boolean;

  /**
   * Error information (if canEvaluate is false)
   */
  error?: {
    reason: string;
    expression: string;
    sourceLocation?: { line: number; column: number; file: string };
  };
}
```

**Usage**:
- Returned by `evaluateExpression()` function
- Allows graceful fallback: if expression can't be evaluated, treat the constant as a regular variable (no folding)
- Used for User Story 3 (P3) - compile-time expression evaluation

**Example Success**:
```typescript
const result: ExpressionEvaluationResult = {
  canEvaluate: true,
  value: 30, // Result of evaluating "10 + 20"
};
```

**Example Failure**:
```typescript
const result: ExpressionEvaluationResult = {
  canEvaluate: false,
  error: {
    reason: 'Cannot evaluate: references non-constant variable',
    expression: 'x + 5', // Where 'x' is a 'let' variable
    sourceLocation: { line: 5, column: 15, file: 'example.eligian' }
  }
};
```

---

## AST Integration

### Langium AST Nodes (Read-Only)

These are existing Langium AST node types that we read during constant folding. We **do not modify** these - they are inputs to the optimization.

```typescript
// From generated/ast.ts (read-only, provided by Langium)
interface ConstDeclaration {
  $type: 'ConstDeclaration';
  name: string;               // Constant name
  value: Expression;          // RHS expression (literal or computed)
}

interface VariableReference {
  $type: 'VariableReference';
  name: string;               // Variable/constant name being referenced
}

type Expression =
  | Literal
  | BinaryExpression
  | UnaryExpression
  | VariableReference
  | /* ... other expression types */;
```

**Read Path**:
1. AST traversal finds `ConstDeclaration` nodes
2. Extract `name` and `value` (expression)
3. Evaluate `value` to get literal → create `ConstantValue`
4. Store in `ConstantMap`

**Replace Path**:
1. During transformation, encounter `VariableReference` node
2. Check if `name` exists in `ConstantMap`
3. If yes: replace with literal JSON value
4. If no: generate normal `$globalData.name` reference

---

## Expression Evaluation Support (User Story 3)

### Supported Expression Types

For User Story 3 (P3 - compile-time expression evaluation), we support these AST node types:

```typescript
// Supported for compile-time evaluation
type EvaluableExpression =
  | Literal                    // Already a constant (e.g., "hello", 42, true)
  | BinaryExpression           // Arithmetic, logical, comparison (e.g., 10 + 20, true && false)
  | UnaryExpression            // Negation, logical NOT (e.g., -5, !true)
  | VariableReference          // Reference to another constant (transitive resolution)

// NOT supported (graceful fallback to no folding)
type NonEvaluableExpression =
  | FunctionCallExpression     // e.g., Math.sqrt(9) - requires runtime
  | ArrayLiteral               // e.g., [1, 2, 3] - complex type (out of scope for MVP)
  | ObjectLiteral              // e.g., {x: 5} - complex type (out of scope for MVP)
  | TernaryExpression          // e.g., x ? 1 : 2 - control flow (can be added later)
```

### Expression Evaluator Function Signature

```typescript
/**
 * Evaluate a constant expression at compile time
 * @param expr - The AST expression node to evaluate
 * @param constants - The constant map (for resolving variable references)
 * @param evaluating - Set of constants currently being evaluated (for cycle detection)
 * @returns Evaluation result with value or error
 */
function evaluateExpression(
  expr: Expression,
  constants: ConstantMap,
  evaluating: Set<string> = new Set()
): ExpressionEvaluationResult;
```

---

## Validation Rules

### 1. Constant Detection Rules

A `ConstDeclaration` is eligible for folding if:
- ✅ Declared in **global scope** (not inside an action or function)
- ✅ Value is a **primitive type** (string, number, boolean)
- ✅ Value is **evaluable at compile time** (literal or simple expression)

**Examples**:
```typescript
// ✅ Eligible
const MESSAGE = "hello";
const DELAY = 1000;
const FLAG = true;
const SUM = 10 + 20; // (User Story 3)

// ❌ Not eligible (out of scope for MVP)
const OBJ = { x: 5 };        // Object literal (P4+)
const ARR = [1, 2, 3];       // Array literal (P4+)
const RESULT = Math.sqrt(9); // Function call (requires runtime)
```

### 2. Reference Replacement Rules

A `VariableReference` is replaced with a literal if:
- ✅ The name exists in `ConstantMap`
- ✅ The constant's value is a primitive type
- ✅ The reference is in a context that accepts literals (actions, operations, expressions)

**Example Transformation**:
```eligian
// Source
const DELAY = 1000;
action wait [
  sleep(DELAY)
]

// Generated JSON (before optimization)
{
  "init": { "operations": [{ "setGlobalData": { "DELAY": 1000 } }] },
  "actions": {
    "wait": { "operations": [{ "sleep": { "ms": "$globalData.DELAY" } }] }
  }
}

// Generated JSON (after optimization - constant folded)
{
  "actions": {
    "wait": { "operations": [{ "sleep": { "ms": 1000 } }] }
  }
}
// Note: No init action, no globalData reference
```

---

## Error Handling

### Compile-Time Errors

The constant folding pass should produce clear errors for:

1. **Circular Dependencies**:
   ```eligian
   const A = B + 1;
   const B = A + 1; // Error: Circular constant dependency detected
   ```

2. **Type Mismatches in Expressions**:
   ```eligian
   const X = "hello" + 5; // Error: Cannot add string and number
   ```

3. **Division by Zero**:
   ```eligian
   const Y = 10 / 0; // Error: Division by zero in constant expression
   ```

4. **Undefined Constants**:
   ```eligian
   const Z = UNDEFINED_CONST + 1; // Error: Reference to undefined constant
   ```

**Error Message Format**:
```
Error: [Constant Folding] {reason}
  at {file}:{line}:{column}
  Expression: {expression}
  Hint: {helpful suggestion}
```

---

## Performance Considerations

### Memory Usage

- **ConstantMap Size**: O(N) where N = number of global constants
- **Per-Constant Overhead**: ~100 bytes (name + value + type + source location)
- **Typical Usage**: 10-50 constants per file = ~1-5 KB per compilation

### Lookup Performance

- **Map Lookup**: O(1) average case
- **Expression Evaluation**: O(E) where E = expression depth (typically <10)
- **Total Impact**: <10% compile time increase (Success Criterion SC-003)

---

## Summary

This data model provides:
- ✅ Simple, immutable structures (`ConstantValue`, `ConstantMap`)
- ✅ Type-safe representation of constant values
- ✅ Clear separation between evaluable and non-evaluable expressions
- ✅ Graceful error handling with detailed error messages
- ✅ Integration with existing Langium AST types (read-only)

**Next**: Generate `quickstart.md` with implementation steps using these data structures.
