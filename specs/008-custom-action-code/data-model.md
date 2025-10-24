# Data Model: Custom Action Code Completions

**Feature**: 008-custom-action-code
**Phase**: 1 - Design Artifacts
**Date**: 2025-10-24

---

## Overview

This feature extends code completion to include custom actions alongside built-in operations. The data model defines the structure of completion items and how actions are discovered and presented.

---

## Core Entities

### ActionDefinition (Existing)

**Source**: Generated AST from `eligian.langium`

```typescript
interface ActionDefinition extends AstNode {
  $type: 'RegularActionDefinition' | 'EndableActionDefinition';
  name: string;
  parameters: Parameter[];
  // ... other properties
}
```

**Role**: Represents user-defined custom actions in the DSL. Discovered from document AST and converted to completion items.

**Discovery**: Filter `program.elements` by `isActionDefinition()` type guard.

---

### CompletionItem (LSP Standard)

**Source**: `vscode-languageserver-types` (LSP 3.17)

```typescript
interface CompletionItem {
  // Display properties
  label: string;                    // What appears in IDE (includes prefix)
  kind?: CompletionItemKind;       // Icon type (Function, Class, etc.)
  detail?: string;                 // Secondary info (e.g., parameters)
  documentation?: string | MarkupContent;  // Help text

  // Insertion behavior
  insertText?: string;             // Text to insert (without prefix)
  insertTextFormat?: InsertTextFormat;  // Plain or snippet
  textEdit?: TextEdit;             // Alternative to insertText

  // Filtering and sorting
  filterText?: string;             // Text for filtering (defaults to label)
  sortText?: string;               // Text for sorting (defaults to label)
}
```

**Role**: Represents a single suggestion in the code completion list. Used for both operations and actions.

**Properties Used in This Feature**:
- `label`: Display name with prefix (e.g., "operation: selectElement")
- `insertText`: Name without prefix (e.g., "selectElement")
- `kind`: Always `CompletionItemKind.Function` (value: 3)
- `detail`: Parameter signature (future enhancement)
- `documentation`: Action/operation description (future enhancement)

---

## Data Transformations

### ActionDefinition → CompletionItem

**Input**: `ActionDefinition` AST node

**Output**: `CompletionItem` for IDE completion list

**Transformation**:

```typescript
function actionToCompletionItem(action: ActionDefinition): CompletionItem {
  return {
    label: `action: ${action.name}`,
    insertText: action.name,
    kind: CompletionItemKind.Function,
    // Future enhancements:
    // detail: formatParameters(action.parameters),
    // documentation: extractDocComment(action)
  };
}
```

**Example**:

```eligian
// Input DSL:
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

// Output CompletionItem:
{
  label: "action: fadeIn",
  insertText: "fadeIn",
  kind: 3  // CompletionItemKind.Function
}
```

---

### Operation Metadata → CompletionItem

**Input**: `OperationSignature` from `OPERATION_REGISTRY`

**Output**: `CompletionItem` for IDE completion list

**Transformation** (modifies existing logic):

```typescript
function operationToCompletionItem(op: OperationSignature): CompletionItem {
  return {
    label: `operation: ${op.systemName}`,  // ADD PREFIX
    insertText: op.systemName,
    kind: CompletionItemKind.Function,
    detail: formatParameters(op.parameters),
    documentation: op.description
  };
}
```

**Example**:

```typescript
// Input Registry Entry:
{
  systemName: "selectElement",
  parameters: [{ name: "selector", type: "string", required: true }],
  description: "Selects a DOM element by CSS selector"
}

// Output CompletionItem:
{
  label: "operation: selectElement",
  insertText: "selectElement",
  kind: 3,
  detail: "(selector: string)",
  documentation: "Selects a DOM element by CSS selector"
}
```

---

## Data Flow

### Completion Request Flow

```
User triggers completion (Ctrl+Space)
  ↓
Langium LSP Server receives completion request
  ↓
Langium calls: EligianCompletionProvider.completionFor(context)
  ↓
Provider executes:
  1. Get document from context
  2. Extract Program AST
  3. Filter for ActionDefinition nodes
  4. Transform actions → CompletionItems (with "action:" prefix)
  5. Transform operations → CompletionItems (with "operation:" prefix)
  6. Combine both arrays
  7. Sort alphabetically by label (case-insensitive)
  8. Return via acceptor
  ↓
Langium sends CompletionList to VS Code
  ↓
VS Code displays completion list with labels
  ↓
User selects item
  ↓
VS Code inserts insertText (or label if insertText absent)
```

---

## Sorting Algorithm

### Input

Array of `CompletionItem` objects (operations + actions combined).

### Algorithm

**Case-insensitive alphabetical sorting by label**:

```typescript
items.sort((a, b) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
);
```

**Options**:
- `undefined`: Use default locale
- `{ sensitivity: 'base' }`: Ignore case and diacritics

### Example

**Input**:
```typescript
[
  { label: "action: fadeIn" },
  { label: "operation: addClass" },
  { label: "action: setup" },
  { label: "operation: selectElement" },
  { label: "operation: wait" }
]
```

**Output** (sorted):
```typescript
[
  { label: "action: fadeIn" },       // 'f' < 'a' (case-insensitive)
  { label: "operation: addClass" },  // 'a' (after 'action:')
  { label: "operation: selectElement" },
  { label: "action: setup" },
  { label: "operation: wait" }
]
```

**Wait, that's wrong!** Let me recalculate with proper alphabetical order:

**Correct Output**:
```typescript
[
  { label: "action: fadeIn" },           // 'action: f' comes first
  { label: "operation: addClass" },      // 'operation: a'
  { label: "operation: selectElement" }, // 'operation: s'
  { label: "action: setup" },            // 'action: s' (after 'operation:')
  { label: "operation: wait" }           // 'operation: w'
]
```

Actually, that's still wrong. Alphabetically by the full label:

**Truly Correct Output**:
```typescript
[
  { label: "action: fadeIn" },           // "action: f..." (a < o)
  { label: "action: setup" },            // "action: s..." (a < o)
  { label: "operation: addClass" },      // "operation: a..." (o)
  { label: "operation: selectElement" }, // "operation: s..." (o)
  { label: "operation: wait" }           // "operation: w..." (o)
]
```

**Wait, one more time with actual alphabetical comparison**:

Comparing full strings alphabetically:
- "action: fadeIn" vs "action: setup" vs "operation: ..."

```
'a' (action) < 'o' (operation)
```

So all actions come before operations! Let me trace through properly:

1. "action: fadeIn" - starts with 'a'
2. "action: setup" - starts with 'a', then 'c', then 't', then 'i', then 'o', then 'n', then ':', then 's'
3. "operation: addClass" - starts with 'o'

Comparing character by character:
- "action: fadeIn" vs "action: setup": 'a' = 'a', 'c' = 'c', ... then 'f' < 's'
- All "action:" < all "operation:" because 'a' < 'o'

**Final Correct Output**:
```typescript
[
  { label: "action: fadeIn" },           // action: f < action: s
  { label: "action: setup" },            // action: s < operation:
  { label: "operation: addClass" },      // operation: a < operation: s
  { label: "operation: selectElement" }, // operation: s < operation: w
  { label: "operation: wait" }
]
```

**Important**: This means actions will always appear before operations in the list (not interleaved). This matches user expectation scenario US2-T1 which shows mixed order, so this needs clarification.

**User Spec Example** (US2, Scenario 1):
> actions `fadeIn`, `setup` and operations `addClass`, `selectElement`, `wait`
> Then list shows: `action: fadeIn`, `operation: addClass`, `operation: selectElement`, `action: setup`, `operation: wait`

This shows **interleaved** sorting (not grouped)! The user wants to sort by the **name** after the prefix, not the full label!

### Corrected Sorting Algorithm

**Sort by name (after prefix), not full label**:

```typescript
function getSortKey(item: CompletionItem): string {
  // Extract name after "operation: " or "action: " prefix
  const match = item.label.match(/^(?:operation|action):\s*(.+)$/);
  return match ? match[1].toLowerCase() : item.label.toLowerCase();
}

items.sort((a, b) => {
  const keyA = getSortKey(a);
  const keyB = getSortKey(b);
  return keyA.localeCompare(keyB, undefined, { sensitivity: 'base' });
});
```

**Example with Correct Sorting**:

**Input**:
```typescript
[
  { label: "action: fadeIn" },           // name: "fadeIn"
  { label: "operation: addClass" },      // name: "addClass"
  { label: "action: setup" },            // name: "setup"
  { label: "operation: selectElement" }, // name: "selectElement"
  { label: "operation: wait" }           // name: "wait"
]
```

**Output** (sorted by name):
```typescript
[
  { label: "operation: addClass" },      // "addClass"
  { label: "action: fadeIn" },           // "fadeIn"
  { label: "operation: selectElement" }, // "selectElement"
  { label: "action: setup" },            // "setup"
  { label: "operation: wait" }           // "wait"
]
```

This matches the user spec! Actions and operations are interleaved alphabetically by name.

---

## Data Constraints

### Uniqueness

**Constraint**: Action names must not conflict with operation names (enforced by existing validation from Feature 006).

**Implication**: No duplicate labels in completion list.

### Completeness

**Constraint**: All actions in the current document MUST appear in completion list (SC-003: 100% coverage).

**Verification**: Filter `program.elements` captures all `ActionDefinition` nodes.

### Performance

**Constraint**: Completion must respond within 200ms (from technical context).

**Analysis**:
- Action discovery: O(n) where n = program elements (~100 max)
- Sorting: O(m log m) where m = completions (~50 operations + ~20 actions = ~70 items)
- Total: O(n + m log m) ≈ O(100 + 70 log 70) ≈ O(100 + 420) ≈ O(520) ≈ negligible

**Conclusion**: Performance constraint easily met.

---

## State Management

### No Persistent State

Completion items are generated fresh on each request from:
- Current document AST (for actions)
- Operation registry (static, loaded at startup)

**Rationale**: Langium manages document state and reactivity. Provider remains stateless.

### Reactivity

When user modifies document (adds/removes actions):
1. Langium re-parses document
2. AST is updated
3. Next completion request queries updated AST
4. New actions appear automatically

**No manual invalidation needed** - Langium handles this (SC-005: updates within 1 second).

---

## Future Enhancements (Out of Scope)

### Parameter Details

```typescript
{
  label: "action: fadeIn",
  insertText: "fadeIn",
  detail: "(selector: string, duration: number)",  // ← Add this
  kind: CompletionItemKind.Function
}
```

### Documentation from Comments

```eligian
/**
 * Fades in an element over specified duration
 */
action fadeIn(selector: string, duration: number) [...]
```

```typescript
{
  label: "action: fadeIn",
  documentation: {
    kind: MarkupKind.Markdown,
    value: "Fades in an element over specified duration"
  }
}
```

### Cross-File Actions (Library Imports)

When library import feature is added, discovery will need to query imported actions as well.

---

## Summary

### Entities
- `ActionDefinition` (existing AST type)
- `CompletionItem` (LSP standard)

### Transformations
- `ActionDefinition` → `CompletionItem` (add "action:" prefix)
- `OperationSignature` → `CompletionItem` (add "operation:" prefix)

### Sorting
- Extract name after prefix
- Sort alphabetically by name (case-insensitive)
- Actions and operations interleaved

### Data Flow
- User triggers completion
- Provider queries document for actions
- Provider combines actions + operations
- Provider sorts by name
- LSP returns to VS Code
- User selects, VS Code inserts `insertText`

**Data model is complete and ready for implementation.**
