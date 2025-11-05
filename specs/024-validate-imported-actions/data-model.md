# Data Model: Validate Imported Actions in Operation Context

**Date**: 2025-01-05
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Research**: [research.md](./research.md)

## Overview

This document defines the updated validation flow and data structures for checking imported actions during operation validation. The design extends the existing `checkOperationExists` validator method to query imported actions from the scope provider before falling back to the operation registry.

---

## 1. Validation Flow

### Current Flow (Before Fix)

```
checkOperationExists(operation: OperationCall)
  ↓
1. Extract operation name
  ↓
2. Check LOCAL actions
   ├─ Found → RETURN (valid action) ✅
   └─ Not found → Continue
  ↓
3. Check LIBRARY actions
   ├─ Found → RETURN (valid action) ✅
   └─ Not found → Continue
  ↓
4. Check BUILTIN operations
   ├─ Found → RETURN (valid operation) ✅
   └─ Not found → Report "Unknown operation" error ❌
```

**Bug**: Imported actions skip straight to step 4, get marked as "unknown operation".

### Updated Flow (After Fix)

```
checkOperationExists(operation: OperationCall)
  ↓
1. Extract operation name
  ↓
2. Check LOCAL actions
   ├─ Found → RETURN (valid action) ✅
   └─ Not found → Continue
  ↓
3. Check LIBRARY actions
   ├─ Found → RETURN (valid action) ✅
   └─ Not found → Continue
  ↓
4. ✨ NEW: Check IMPORTED actions
   ├─ Found → RETURN (valid action) ✅
   └─ Not found → Continue
  ↓
5. Check BUILTIN operations
   ├─ Found → RETURN (valid operation) ✅
   └─ Not found → Report "Unknown operation" error ❌
```

**Fix**: Add import check at step 4, before falling back to operations.

---

## 2. Data Structures

### ActionDefinition (Existing)

**Source**: Langium generated AST (`packages/language/src/generated/ast.ts`)

```typescript
interface ActionDefinition {
  $type: 'RegularActionDefinition' | 'EndableActionDefinition';
  name: string;
  parameters?: Parameter[];
  body: InlineAction | InlineEndableAction;
  // ... other AST properties
}
```

**Usage**: Represents an action definition in the AST (both local and imported).

### Program (Existing)

**Source**: Langium generated AST

```typescript
interface Program {
  $type: 'Program';
  statements: Statement[];
  // ... other AST properties
}
```

**Usage**: Root AST node containing all statements (imports, actions, timelines).

### LibraryImport (Existing)

**Source**: Langium generated AST

```typescript
interface LibraryImport {
  $type: 'LibraryImport';
  actions: ActionImport[];
  path: string;
  // ... other AST properties
}
```

**Usage**: Represents `import { foo, bar } from "./lib.eligian"` statements.

### ActionImport (Existing)

**Source**: Langium generated AST

```typescript
interface ActionImport {
  $type: 'ActionImport';
  action: Reference<ActionDefinition>;
  alias?: string;  // For "import { foo as bar }"
  // ... other AST properties
}
```

**Usage**: Represents individual imported action with optional alias.

---

## 3. Validation Context

### EligianValidator (Modified)

**Location**: `packages/language/src/eligian-validator.ts`

**Key Properties**:
```typescript
class EligianValidator {
  services: EligianServices;  // Access to scope provider

  // ... existing methods

  checkOperationExists(
    operation: OperationCall,
    accept: ValidationAcceptor
  ): void {
    // Modified to include import check
  }
}
```

### Services Access Pattern

**Accessing Scope Provider**:
```typescript
// In validator method
const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
```

**Type Safety**: Cast to `EligianScopeProvider` to access `getImportedActions` method.

---

## 4. Import Registry Query

### Query Interface

**Method**: `EligianScopeProvider.getImportedActions(program: Program)`

**Signature**:
```typescript
/**
 * Get all actions imported from library files (Feature 024).
 * Used for validation and code completion.
 */
public getImportedActions(program: Program): ActionDefinition[]
```

**Returns**: Array of all `ActionDefinition` nodes imported via library imports.

**Implementation Details**:
- Resolves library file paths from import statements
- Loads library documents from Langium workspace
- Extracts action definitions matching import names
- Handles relative paths (`./` prefix normalization)
- Returns empty array if no imports or library not found

### Usage Pattern in Validator

```typescript
// Get program node (contains imports)
const program = this.getProgram(operation);
if (!program) {
  // Cannot check imports without program context
  // Fall through to operation check
} else {
  // Query scope provider for imported actions
  const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
  const importedActions = scopeProvider.getImportedActions(program);

  // Check if operation name matches any imported action
  const importedAction = findActionByName(opName, importedActions);
  if (importedAction) {
    // Valid imported action - skip operation validation
    return;
  }
}

// Continue to operation validation...
```

---

## 5. Name Resolution

### Helper Function: `findActionByName`

**Location**: `packages/language/src/compiler/name-resolver.ts`

**Signature**:
```typescript
export function findActionByName(
  name: string,
  programOrActions: Program | ActionDefinition[]
): ActionDefinition | undefined
```

**Usage with Imported Actions**:
```typescript
const importedActions: ActionDefinition[] = scopeProvider.getImportedActions(program);
const action = findActionByName('fadeIn', importedActions);
// Returns ActionDefinition if 'fadeIn' exists in imports, undefined otherwise
```

**Why Reuse This Helper**:
- Already used for local actions (line 474 in validator)
- Handles both `Program` and `ActionDefinition[]` inputs
- Consistent with existing validation patterns
- No new code needed

---

## 6. Error Handling

### No Errors from Import Resolution

**Design Decision**: Import resolution failures are **silent** in validator.

**Rationale**:
- Import validation is a **separate concern** (handled elsewhere)
- If library file doesn't exist → import statement shows error
- If action doesn't exist in library → import statement shows error
- Validator only checks: "Is this name an imported action?"

**Behavior**:
- `getImportedActions()` returns empty array if library not found
- Validator continues to operation check (correct fallback)
- User sees "unknown operation" error (correct - action doesn't exist)

### Error Messages Unchanged

**Existing Error Format**:
```typescript
accept('error', `${error.message}. ${error.hint}`, {
  node: operation,
  property: 'operationName',
  code: error.code.toLowerCase(),
});
```

**Examples**:
- "Unknown operation: 'fadein'. Did you mean: 'fadeIn'?"
- "Unknown operation: 'setText'. Use 'setElementContent' instead."

**No Changes Needed**: Error reporting logic remains identical.

---

## 7. Data Flow Diagram

### Complete Validation Flow

```
┌─────────────────────────────────────────┐
│   OperationCall AST Node                │
│   (e.g., fadeIn("#box", 1000))         │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   checkOperationExists(operation)       │
│   Extract operation name: "fadeIn"      │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Get Program node (context)            │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Check LOCAL actions                   │
│   findActionByName("fadeIn", program)   │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │ Found?      │
        └──────┬──────┘
     Yes │     │ No
         │     ↓
         │  ┌─────────────────────────────────────────┐
         │  │   Check LIBRARY actions                 │
         │  │   (if in library context)               │
         │  └──────────────┬──────────────────────────┘
         │                 │
         │          ┌──────┴──────┐
         │          │ Found?      │
         │          └──────┬──────┘
         │       Yes │     │ No
         │           │     ↓
         │           │  ┌────────────────────────────────────────┐
         │           │  │ ✨ NEW: Check IMPORTED actions         │
         │           │  │ scopeProvider.getImportedActions()     │
         │           │  │ findActionByName("fadeIn", imports)    │
         │           │  └──────────────┬───────────────────────────┘
         │           │                 │
         │           │          ┌──────┴──────┐
         │           │          │ Found?      │
         │           │          └──────┬──────┘
         │           │       Yes │     │ No
         │           │           │     ↓
         │           │           │  ┌─────────────────────────────────────┐
         │           │           │  │   Check BUILTIN operations          │
         │           │           │  │   validateOperationExists("fadeIn") │
         │           │           │  └──────────────┬──────────────────────┘
         │           │           │                 │
         │           │           │          ┌──────┴──────┐
         │           │           │          │ Found?      │
         │           │           │          └──────┬──────┘
         │           │           │       Yes │     │ No
         │           │           │           │     ↓
         │           │           │           │  ┌──────────────────────────┐
         │           │           │           │  │ Report Error:            │
         │           │           │           │  │ "Unknown operation"      │
         │           │           │           │  └──────────────────────────┘
         │           │           │           │
         ↓           ↓           ↓           ↓
┌─────────────────────────────────────────┐
│   RETURN (validation complete)          │
│   No error reported                     │
└─────────────────────────────────────────┘
```

### Import Resolution (Scope Provider)

```
┌─────────────────────────────────────────┐
│   Program AST Node                      │
│   Contains: import statements           │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   scopeProvider.getImportedActions()    │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Extract LibraryImport statements      │
│   (e.g., import { fadeIn } from "...")  │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   For each import:                      │
│   1. Resolve library file path          │
│   2. Load library document              │
│   3. Extract imported action defs       │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Return: ActionDefinition[]            │
│   (All imported actions)                │
└─────────────────────────────────────────┘
```

---

## 8. Performance Characteristics

### Time Complexity

**Import Check**:
- `getImportedActions(program)`: O(I × A)
  - I = number of import statements (typically 1-5)
  - A = average actions per library (typically 5-20)
  - Total: O(100) worst case

- `findActionByName(name, imports)`: O(N)
  - N = total imported actions (typically 5-30)

**Total Overhead**: O(100) + O(30) = **O(1)** in practice (constant small numbers)

**Measured Impact**: <5ms per validation (see research.md Section 6)

### Space Complexity

**Import Registry**:
- Stored in scope provider's internal cache
- One array per program node
- Size: O(number of imported actions) = typically 5-30 references

**Validator State**:
- No additional state needed
- Queries scope provider on-demand
- No caching in validator (reuses scope provider cache)

**Total Overhead**: O(N) where N = imported actions (negligible)

---

## 9. Backward Compatibility

### No Breaking Changes

**Existing Behavior Preserved**:
- ✅ Local actions: validation unchanged
- ✅ Library actions: validation unchanged
- ✅ Builtin operations: validation unchanged
- ✅ Error messages: format unchanged

**Only Change**: Imported actions now pass validation (bug fix).

### Test Compatibility

**Existing Tests**:
- All 1,565+ tests must pass (no modifications)
- Tests without imports: behavior identical
- Tests with imports: previously showed false errors, now pass

**New Tests**:
- 4 new tests for imported action validation
- Isolated in separate test suite (no interference)

---

## 10. Alternative Approaches Considered

### Alternative 1: Extend `findActionByName` to Check Imports

**Approach**: Modify `findActionByName(name, program)` to query imports automatically.

**Pros**:
- Single function handles all action lookups
- Less code duplication

**Cons**:
- Changes existing helper function (higher risk)
- Couples name resolver to scope provider
- Breaks separation of concerns

**Decision**: ❌ Rejected - too invasive for a bug fix

### Alternative 2: Extend `buildNameRegistry` to Include Imports

**Approach**: Modify name registry builder to populate imports.

**Pros**:
- Centralized name resolution
- Could benefit other validators

**Cons**:
- Requires refactoring name registry usage
- Higher complexity (violates Constitution Principle I)
- Not needed for this bug fix

**Decision**: ❌ Rejected - gold-plating (violates Constitution Principle III)

### Alternative 3: Create New Validator Method

**Approach**: Add separate `checkImportedActionExists` method.

**Pros**:
- Isolated change (easy to test)
- Clear separation of concerns

**Cons**:
- More code duplication
- Adds complexity to validator
- Existing method is correct place for check

**Decision**: ❌ Rejected - unnecessary abstraction

### Selected Approach: Inline Check in `checkOperationExists`

**Rationale**:
- ✅ Minimal code change (9 lines)
- ✅ Follows existing pattern (local/library checks)
- ✅ Reuses existing infrastructure
- ✅ Clear insertion point (between library and operation checks)
- ✅ Aligns with Constitution Principle I (Simplicity First)

---

## 11. Type Definitions

### Service Types

**EligianServices** (extends Langium services):
```typescript
interface EligianServices extends LanguageServices {
  references: {
    ScopeProvider: EligianScopeProvider;
    // ... other services
  };
  // ... other services
}
```

**EligianScopeProvider**:
```typescript
class EligianScopeProvider {
  /**
   * Get all actions imported from library files (Feature 024).
   * Used for validation and code completion.
   */
  public getImportedActions(program: Program): ActionDefinition[];

  // ... other methods
}
```

### Validator Method Signature (Unchanged)

```typescript
class EligianValidator {
  checkOperationExists(
    operation: OperationCall,
    accept: ValidationAcceptor
  ): void;
}
```

**Parameters**:
- `operation`: AST node representing the operation call
- `accept`: Langium callback for reporting validation errors

**Returns**: `void` (errors reported via `accept` callback)

---

## Conclusion

The data model shows that the fix is a **minimal extension** of the existing validation flow. By adding a single import check using the scope provider's existing API, imported actions will be correctly validated without any breaking changes to existing functionality.

**Key Points**:
1. Reuses existing infrastructure (scope provider, name resolver)
2. Follows existing patterns (local/library action checks)
3. No new data structures needed
4. No breaking changes to existing behavior
5. Performance impact negligible (<5ms)

**Next**: See [quickstart.md](./quickstart.md) for implementation guide and test examples.
