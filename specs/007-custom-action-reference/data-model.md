# Data Model: Custom Action Reference Provider

**Date**: 2025-10-24
**Feature**: Custom Action Reference Provider

## Overview

This document defines the data model for custom action reference resolution in the Eligian DSL. The model describes entities involved in resolving action calls to action definitions for "Go to Definition" functionality.

## Entity Relationships

```
Document
  ├── ActionDefinition[] (definitions)
  └── Timeline
       └── TimelineEvent[]
            └── OperationCall[] (action calls)
                  └── Reference<ActionDefinition> (resolved link)
```

## Core Entities

### 1. ActionDefinition (Existing AST Node)

**Description**: Represents a custom action definition in the DSL. This is the **target** of reference resolution - where "Go to Definition" navigates to.

**Attributes**:
- `name: string` - Action identifier (unique per document)
- `parameters: ActionParameter[]` - Parameter list with names and optional type annotations
- `operations: OperationStatement[]` - Action body (sequence of operations)
- `$cstNode: CstNode` - Concrete syntax tree node (provides source location)

**Source Location** (derived from `$cstNode`):
- `line: number` - Line number in document
- `column: number` - Column offset in line
- `offset: number` - Character offset from start of file
- `length: number` - Length of the action definition text

**Example**:
```eligian
action fadeIn(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**Navigation Target**: When user Ctrl+Clicks on `fadeIn()` call, cursor should jump to line 1, column 8 (start of action name).

---

### 2. OperationCall (Existing AST Node)

**Description**: Represents a call to either a custom action or built-in operation. This is the **source** of reference resolution - where user Ctrl+Clicks.

**Attributes**:
- `operationName: string` - Name to resolve (action or operation name)
- `args: Expression[]` - Call arguments (expressions)
- `$cstNode: CstNode` - Concrete syntax tree node (provides source location)

**Source Location** (derived from `$cstNode`):
- `line: number` - Line number of the call
- `column: number` - Column offset in line
- `offset: number` - Character offset from start of file
- `length: number` - Length of the operation call text

**Example**:
```eligian
at 0s..1s fadeIn("#box", 1000)
```

**Navigation Source**: User Ctrl+Clicks on `fadeIn` (line 1, column 11-16) → should navigate to ActionDefinition.

---

### 3. Reference<ActionDefinition> (Langium Managed)

**Description**: Represents the resolved link from an OperationCall to an ActionDefinition. Managed internally by Langium's Linker service.

**Attributes**:
- `$refText: string` - The text used to reference the target (e.g., "fadeIn")
- `ref: ActionDefinition | undefined` - Resolved target node (undefined if unresolved)
- `error: LinkingError | undefined` - Error if resolution failed

**Resolution States**:
1. **Resolved**: `ref` points to ActionDefinition, `error` is undefined
   - "Go to Definition" works (navigates to ActionDefinition)
2. **Unresolved**: `ref` is undefined, `error` contains linking error
   - "Go to Definition" shows "No definition found" message
   - Validator shows "Unknown operation" error

**Example (after linking)**:
```typescript
const operationCall: OperationCall = /* ... */;
const reference: Reference<ActionDefinition> = operationCall.operationName as any;
// After linking:
reference.ref // → ActionDefinition node or undefined
reference.$refText // → "fadeIn"
```

---

### 4. ReferenceInfo (Langium Context)

**Description**: Context object passed to ScopeProvider.getScope() during reference resolution. Provides information about what reference is being resolved.

**Attributes**:
- `reference: Reference` - The reference object to resolve
- `container: AstNode` - Parent AST node (e.g., OperationCall, Timeline Event)
- `property: string` - Property name being resolved (e.g., "operationName")
- `index?: number` - Array index if reference is in array (optional)

**Usage in ScopeProvider**:
```typescript
getScope(context: ReferenceInfo): Scope {
  // Check if we're resolving an OperationCall's operationName
  if (isOperationCall(context.container) && context.property === 'operationName') {
    // Resolve action reference
    const operationName = context.container.operationName;
    return this.resolveActionScope(operationName, context);
  }
  return super.getScope(context);
}
```

**When is this called?**:
- During linking phase (after parsing, before validation)
- Automatically by Langium's Linker for all cross-references
- Lazily when LSP requests "Go to Definition" (if lazy linking enabled)

---

### 5. Scope (Langium Resolution Context)

**Description**: Represents a collection of available symbols that can be referenced. Returned by ScopeProvider.getScope() to tell Langium what nodes are valid targets.

**Attributes**:
- `getElement(name: string): AstNodeDescription | undefined` - Find symbol by name
- `getAllElements(): Stream<AstNodeDescription>` - Get all available symbols

**Implementations**:
- `MapScope` - Static collection of symbols (used for action references)
- `StreamScope` - Lazy collection of symbols (used for global scopes)
- `EMPTY_SCOPE` - No symbols available (unresolved reference)

**Usage**:
```typescript
// Create scope with ActionDefinition
const description = this.descriptions.createDescription(actionDef, actionDef.name);
return new MapScope([description]);

// Or return empty scope if not found
return EMPTY_SCOPE;
```

---

### 6. AstNodeDescription (Langium Symbol Metadata)

**Description**: Metadata about an AST node that can be referenced. Created by AstNodeDescriptionProvider and stored in Scopes.

**Attributes**:
- `name: string` - Symbol name (e.g., "fadeIn")
- `type: string` - AST node type (e.g., "ActionDefinition")
- `path: string` - Path to node in AST (used to load node lazily)
- `documentUri: URI` - URI of document containing the node
- `node: AstNode | undefined` - Direct reference to AST node (if loaded)

**Creation**:
```typescript
const description = this.descriptions.createDescription(
  actionDef,           // AstNode to describe
  actionDef.name,      // Symbol name
  document             // LangiumDocument (optional)
);
```

**When is this used?**:
- Stored in Scopes to represent available symbols
- Linker uses `description.node` or `description.path` to load target node
- LSP uses `description.documentUri` and path for navigation

---

## Data Flow: Reference Resolution

**Step-by-step process** for resolving `fadeIn()` call:

1. **Parsing Phase**:
   - Langium parser creates `OperationCall` AST node for `fadeIn()`
   - `operationCall.operationName = "fadeIn"` (string, not resolved yet)

2. **Linking Phase** (automatic):
   - Linker finds all references in document (including `operationCall.operationName`)
   - Linker calls `ScopeProvider.getScope(context)` where:
     - `context.container = operationCall`
     - `context.property = "operationName"`

3. **Custom ScopeProvider Logic**:
   - Check if `context.container` is `OperationCall`
   - Extract operation name: `"fadeIn"`
   - Search document for `ActionDefinition` with `name === "fadeIn"`
   - If found: Create `AstNodeDescription` and return `MapScope([description])`
   - If not found: Return `EMPTY_SCOPE`

4. **Linker Resolution**:
   - If Scope contains matching description:
     - Set `operationCall.operationName.ref = actionDefinition`
     - Reference is resolved ✅
   - If Scope is empty:
     - `operationCall.operationName.ref = undefined`
     - Reference is unresolved ❌

5. **LSP "Go to Definition"** (triggered by Ctrl+Click):
   - VS Code sends LSP `textDocument/definition` request
   - Langium's `DefaultReferencesProvider` handles request:
     - Finds AST node at cursor position (the `OperationCall`)
     - Checks if `operationCall.operationName.ref` is defined
     - If defined: Returns location of `actionDefinition.$cstNode`
     - If undefined: Returns empty result (no navigation)

6. **VS Code Navigation**:
   - VS Code opens file at returned location
   - Cursor jumps to action definition line/column

---

## Validation Rules

These validation rules ensure reference integrity:

1. **Unique Action Names**:
   - Each ActionDefinition.name must be unique per document
   - Enforced by `checkDuplicateActions()` validator
   - Prevents ambiguous references

2. **Action Name Collision**:
   - Action names cannot conflict with built-in operation names
   - Enforced by `checkActionNameCollision()` validator
   - Prevents shadowing of built-in operations

3. **Unknown Operation/Action**:
   - All OperationCall.operationName must resolve to either:
     - A built-in operation (in registry)
     - An ActionDefinition (in document)
   - Enforced by `checkOperationExists()` validator
   - Shows "Unknown operation" error for unresolved references

---

## Timeline Context Scenarios

**Where OperationCall nodes appear** (all should support navigation):

### 1. Direct Timeline Calls
```eligian
at 0s..1s fadeIn("#box", 1000)
```
- OperationCall is direct child of TimelineEvent
- `context.container = operationCall`

### 2. Inline Endable Action Blocks
```eligian
at 0s..3s [ fadeIn("#box", 1000) ] [ fadeOut("#box", 500) ]
```
- OperationCall is inside InlineBlockActionList
- `context.container = operationCall`

### 3. Sequence Blocks
```eligian
at 0s..5s sequence { fadeIn() for 1s, slideIn() for 2s }
```
- OperationCall is inside SequenceBlock
- `context.container = operationCall`

### 4. Stagger Blocks
```eligian
at 0s..10s stagger 200ms items with fadeIn() for 1s
```
- OperationCall is inside StaggerBlock body
- `context.container = operationCall`

### 5. Action Bodies (Recursive)
```eligian
action compositeAnimation() [
  fadeIn("#box", 1000)
  slideIn("#box", 2000)
]
```
- OperationCall is inside ActionDefinition.operations
- `context.container = operationCall`
- Should resolve to other ActionDefinitions (recursive action calls)

**Key Insight**: All timeline contexts produce the same `ReferenceInfo` structure:
- `context.container` is always `OperationCall`
- `context.property` is always `"operationName"`
- **Same resolution logic works for all contexts**

---

## Performance Characteristics

**Action Lookup**:
- Complexity: O(n) where n = number of ActionDefinitions in document
- Typical case: 5-20 actions → negligible overhead
- Worst case: 100+ actions → should still be <1s (success criteria SC-001)

**Scope Creation**:
- Complexity: O(1) for MapScope with single ActionDefinition
- Memory: Minimal (single AstNodeDescription object)

**Caching**:
- Langium caches linked references after first resolution
- No manual caching needed - automatic optimization

**Benchmark Requirements** (from success criteria):
- SC-001: Navigation < 1 second for 100 action definitions
- SC-006: < 5% LSP overhead for existing operations

---

## Testing Scenarios

**Unit Tests** (ScopeProvider logic):
- Test `getScope()` with `OperationCall` container → returns correct Scope
- Test `getScope()` with non-existent action → returns EMPTY_SCOPE
- Test `getScope()` with non-OperationCall container → delegates to super

**Integration Tests** (Reference resolution):
- Parse document with action definition and call → `ref` is defined
- Parse document with call to non-existent action → `ref` is undefined
- Parse document with multiple actions → `ref` points to correct action
- Test all timeline contexts (direct, inline, sequence, stagger, action body)

**LSP Tests** (Optional - covered by integration tests):
- Simulate "Go to Definition" request → returns correct location
- Simulate "Find All References" request → returns all call sites

---

## Summary

**Key Entities**:
1. `ActionDefinition` - Navigation target (where to go)
2. `OperationCall` - Navigation source (where user clicks)
3. `Reference<ActionDefinition>` - Resolved link (managed by Langium)
4. `ReferenceInfo` - Resolution context (passed to ScopeProvider)
5. `Scope` - Available symbols (returned by ScopeProvider)
6. `AstNodeDescription` - Symbol metadata (stored in Scope)

**Key Flow**:
1. User writes `fadeIn()` → Parser creates `OperationCall`
2. Linker calls `ScopeProvider.getScope()` → Returns `Scope` with `ActionDefinition`
3. Linker sets `operationCall.operationName.ref = actionDefinition`
4. User Ctrl+Clicks → LSP navigates to `actionDefinition.$cstNode` location

**Implementation Files**:
- Extend: `packages/language/src/eligian-scope-provider.ts`
- Create: `packages/language/src/utils/action-resolver.ts`
- Test: `packages/language/src/__tests__/references.spec.ts`
- Test: `packages/language/src/__tests__/lsp-navigation.spec.ts`
