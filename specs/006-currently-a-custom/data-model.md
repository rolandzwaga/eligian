# Data Model: Unified Custom Action and Operation Call Syntax

**Feature**: 006-currently-a-custom
**Date**: 2025-01-23
**Purpose**: Define internal data structures for name resolution and call disambiguation

---

## Overview

This feature introduces internal compiler data structures to distinguish custom action calls from operation calls when both use identical syntax. No user-facing data structures are introduced.

---

## Entity: Name Registry

**Purpose**: Track available callable names (actions + operations) for resolution and collision detection

**Lifecycle**: Built once per file during compilation

**Structure**:
```typescript
interface NameRegistry {
  operations: Set<string>;           // Built-in operation names (from registry)
  actions: Map<string, ActionDefinition>; // Custom action names (from current file)
}
```

**Population**:
- **Operations**: Populated at startup from `OPERATION_REGISTRY` (48 operations)
- **Actions**: Populated during AST traversal (collect all `ActionDefinition` nodes)

**Usage**:
- **Validation**: Check if name is operation (reject in timeline) or action (allow)
- **Transformation**: Resolve call to correct target (action definition vs operation metadata)
- **Error reporting**: Generate suggestions when name not found

**Example**:
```typescript
// Given DSL file:
action fadeIn(selector, duration) [ ... ]
action fadeOut(selector, duration) [ ... ]

// NameRegistry for this file:
{
  operations: Set(['addClass', 'selectElement', 'animate', ...]), // 48 total
  actions: Map([
    ['fadeIn', <ActionDefinition node>],
    ['fadeOut', <ActionDefinition node>]
  ])
}
```

---

## Entity: Call Resolution Result

**Purpose**: Represent the outcome of resolving a call name to its target

**Structure**:
```typescript
type CallResolutionResult =
  | { resolved: true; type: 'action'; target: ActionDefinition }
  | { resolved: true; type: 'operation'; target: OperationSignature }
  | { resolved: false; suggestions: string[] };

interface CallResolutionResult {
  resolved: boolean;
  type?: 'action' | 'operation';
  target?: ActionDefinition | OperationSignature;
  suggestions?: string[];
}
```

**Fields**:
- **resolved**: Boolean - whether the name was successfully resolved
- **type**: String - 'action' or 'operation' (only if resolved = true)
- **target**: Reference to ActionDefinition or OperationSignature (only if resolved = true)
- **suggestions**: Array of similar names (only if resolved = false)

**Usage in Validation**:
```typescript
function validateTimelineCall(call: OperationCall, registry: NameRegistry): ValidationError | null {
  const result = resolveCallName(call.operationName, registry);

  if (!result.resolved) {
    return {
      message: `Unknown action: ${call.operationName}`,
      hint: result.suggestions.length > 0
        ? `Did you mean: ${result.suggestions.join(', ')}?`
        : 'Define this action before using it in a timeline event'
    };
  }

  if (result.type === 'operation') {
    return {
      message: `Cannot use operation '${call.operationName}' directly in timeline events`,
      hint: 'Operations can only be used inside action bodies. Define an action that calls this operation.'
    };
  }

  // result.type === 'action' - Success
  return null;
}
```

**Usage in Transformation**:
```typescript
function transformTimelineCall(call: OperationCall, registry: NameRegistry): OperationConfigIR[] {
  const result = resolveCallName(call.operationName, registry);

  if (!result.resolved || result.type !== 'action') {
    // Should not happen (validator catches this), but handle defensively
    throw new TransformError(`Cannot transform unresolved call: ${call.operationName}`);
  }

  const actionDef = result.target as ActionDefinition;

  // Transform to requestAction + startAction operations
  return [
    createRequestActionOperation(actionDef),
    createStartActionOperation(actionDef, call.args)
  ];
}
```

---

## Entity: Action Symbol Table Entry

**Purpose**: Metadata about a custom action for Langium scoping/linking

**Structure**:
```typescript
interface ActionSymbolEntry {
  name: string;                    // Action name (e.g., 'fadeIn')
  node: ActionDefinition;          // AST node reference
  parameters: ParameterInfo[];     // Parameter signatures
  isEndable: boolean;              // Endable vs regular action
  sourceLocation: SourceLocation;  // For error reporting
}

interface ParameterInfo {
  name: string;       // Parameter name (e.g., 'selector')
  type?: string;      // Optional type annotation (future)
  required: boolean;  // Required vs optional parameter
}
```

**Population**: Built during Langium scope computation phase

**Usage**:
- **IDE Features**: "Go to definition", "Find references", "Rename"
- **Validation**: Parameter count checking, endable action validation
- **Completion**: Suggest available actions with signatures

**Example**:
```typescript
// Given DSL:
action fadeIn(selector, duration) [ ... ]

// Symbol table entry:
{
  name: 'fadeIn',
  node: <ActionDefinition AST node>,
  parameters: [
    { name: 'selector', required: true },
    { name: 'duration', required: true }
  ],
  isEndable: false,
  sourceLocation: { line: 5, column: 0, file: 'demo.eligian' }
}
```

---

## Validation Rules

### Rule: Name Collision Detection

**Trigger**: ActionDefinition node during validation

**Check**: Action name must not match any operation name

**Implementation**:
```typescript
function validateActionNameCollision(action: ActionDefinition, registry: NameRegistry): ValidationError | null {
  if (registry.operations.has(action.name)) {
    return {
      code: 'ACTION_OPERATION_COLLISION',
      message: `Cannot define action '${action.name}': name conflicts with built-in operation`,
      hint: 'Choose a different name for this action'
    };
  }
  return null;
}
```

**Error Example**:
```eligian
action selectElement() [ ... ]  // ❌ ERROR: Conflicts with operation 'selectElement'
```

### Rule: Call Context Validation

**Trigger**: OperationCall node in timeline event context

**Check**: Call name must resolve to an action (not an operation)

**Implementation**:
```typescript
function validateTimelineCallContext(call: OperationCall, registry: NameRegistry): ValidationError | null {
  const result = resolveCallName(call.operationName, registry);

  if (result.type === 'operation') {
    return {
      code: 'OPERATION_IN_TIMELINE',
      message: `Operation '${call.operationName}' cannot be used directly in timeline events`,
      hint: 'Define an action that wraps this operation, then call the action'
    };
  }

  return null;
}
```

**Error Example**:
```eligian
timeline "demo" using raf {
  at 0s..5s selectElement(".box")  // ❌ ERROR: selectElement is an operation, not an action
}
```

### Rule: Duplicate Action Definition

**Trigger**: Multiple ActionDefinition nodes with same name

**Check**: Action name must be unique within file

**Implementation**:
```typescript
function validateDuplicateActions(actions: ActionDefinition[]): ValidationError[] {
  const seen = new Map<string, ActionDefinition>();
  const errors: ValidationError[] = [];

  for (const action of actions) {
    const existing = seen.get(action.name);
    if (existing) {
      errors.push({
        code: 'DUPLICATE_ACTION',
        message: `Duplicate action definition: '${action.name}'`,
        relatedLocation: existing.sourceLocation,
        hint: 'Each action name must be unique within a file'
      });
    } else {
      seen.set(action.name, action);
    }
  }

  return errors;
}
```

**Error Example**:
```eligian
action fadeIn(selector) [ ... ]
action fadeIn(element) [ ... ]  // ❌ ERROR: Duplicate action 'fadeIn'
```

---

## State Transitions

Not applicable (no stateful entities - name resolution is stateless per compilation)

---

## Relationships

```
Program
  ├── ActionDefinition[] (custom actions)
  │     ├── name: string
  │     ├── parameters: Parameter[]
  │     └── body: OperationStatement[]
  │
  └── TimelineDefinition
        └── TimelineEvent[]
              └── TimelineAction
                    └── OperationCall (resolves to ActionDefinition)
```

**Validation Flow**:
1. Collect all ActionDefinitions → Build NameRegistry.actions
2. Load OPERATION_REGISTRY → Populate NameRegistry.operations
3. For each ActionDefinition: Validate name not in operations
4. For each OperationCall in timeline: Resolve to action, validate found
5. For each OperationCall in action body: Resolve to operation, validate found

---

## Performance Characteristics

**NameRegistry Construction**:
- Time: O(n) where n = number of actions in file (typically < 50)
- Space: O(n) for action map + O(48) for operation set

**Name Resolution**:
- Operation lookup: O(1) - Set.has()
- Action lookup: O(1) - Map.get()
- Fuzzy suggestions: O(m) where m = total names (actions + operations)

**Overall Compilation Impact**:
- Expected overhead: < 5% (1-2ms for typical files)
- Scales linearly with file size (not a bottleneck)

---

## Testing Strategy

### Data Structure Tests

```typescript
describe('NameRegistry', () => {
  it('should populate operations from OPERATION_REGISTRY', () => {
    const registry = buildNameRegistry(program);
    expect(registry.operations.size).toBe(48);
    expect(registry.operations.has('addClass')).toBe(true);
  });

  it('should populate actions from program', () => {
    const program = parseProgram('action fadeIn() [ ]');
    const registry = buildNameRegistry(program);
    expect(registry.actions.size).toBe(1);
    expect(registry.actions.has('fadeIn')).toBe(true);
  });
});

describe('resolveCallName', () => {
  it('should resolve action calls', () => {
    const result = resolveCallName('fadeIn', registry);
    expect(result).toEqual({
      resolved: true,
      type: 'action',
      target: expect.any(Object)
    });
  });

  it('should resolve operation names', () => {
    const result = resolveCallName('addClass', registry);
    expect(result).toEqual({
      resolved: true,
      type: 'operation',
      target: expect.objectContaining({ systemName: 'addClass' })
    });
  });

  it('should provide suggestions for unknown names', () => {
    const result = resolveCallName('fadeInnn', registry);
    expect(result).toEqual({
      resolved: false,
      suggestions: expect.arrayContaining(['fadeIn'])
    });
  });
});
```

---

## Summary

This data model introduces minimal internal structures for name resolution:

1. **NameRegistry**: Tracks actions + operations for resolution
2. **CallResolutionResult**: Represents resolution outcome
3. **ActionSymbolEntry**: Langium symbol table metadata

All structures are internal to the compiler - no user-facing data types introduced.
