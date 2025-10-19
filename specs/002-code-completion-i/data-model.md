# Data Model: Code Completion Metadata

**Feature**: Code Completion for Eligian DSL
**Date**: 2025-10-19
**Status**: Complete

## Overview

This document defines the data structures for code completion metadata in the Eligian DSL. These entities are used by the completion provider to generate intelligent suggestions for operations, actions, keywords, events, variables, and parameters.

## Entity Diagrams

```
┌─────────────────────────┐
│  OperationMetadata      │
├─────────────────────────┤
│ name: string            │
│ description: string     │
│ parameters: Param[]     │
│ dependencies: string[]  │
│ outputs: string[]       │
└──────────┬──────────────┘
           │
           │ *
           ▼
┌─────────────────────────┐
│  ParameterMetadata      │
├─────────────────────────┤
│ name: string            │
│ type: string            │
│ required: boolean       │
│ defaultValue?: unknown  │
│ description?: string    │
└─────────────────────────┘

┌──────────────────────────┐
│  TimelineEventMetadata   │
├──────────────────────────┤
│ name: string             │
│ description: string      │
│ category?: string        │
└──────────────────────────┘

┌─────────────────────────┐
│  KeywordMetadata        │
├─────────────────────────┤
│ keyword: string         │
│ description: string     │
│ contextFilter?: string  │
└─────────────────────────┘

┌─────────────────────────┐
│  VariableMetadata       │
├─────────────────────────┤
│ name: string            │
│ type: string            │
│ scope: string           │
│ description: string     │
└─────────────────────────┘
```

---

## 1. OperationMetadata

Represents metadata for an Eligius operation extracted from `../eligius/src/operation/metadata/*.ts`.

### Structure

```typescript
interface OperationMetadata {
  /**
   * Operation name (e.g., "selectElement", "animate")
   * Used as the completion label
   */
  name: string;

  /**
   * Human-readable description from JSDoc comment
   * Shown in completion documentation panel
   */
  description: string;

  /**
   * Array of operation parameters
   * Used to generate parameter completion and documentation
   */
  parameters: ParameterMetadata[];

  /**
   * Properties this operation expects to find on operationData
   * (from previous operations in the chain)
   */
  dependencies: string[];

  /**
   * Properties this operation adds to operationData
   * (for subsequent operations to use)
   */
  outputs: string[];
}
```

### Example

```typescript
{
  name: 'selectElement',
  description: 'This operation selects one or more elements using the specified selector.\n\nIf `useSelectedElementAsRoot` is set to true and a valid DOM element is assigned to the current operation data\'s `selectedElement` property then the element will be looked for only in the descendant elements of this DOM element.',
  parameters: [
    {
      name: 'selector',
      type: 'ParameterType:selector',
      required: true,
      description: 'CSS selector string to find elements'
    },
    {
      name: 'useSelectedElementAsRoot',
      type: 'ParameterType:boolean',
      required: false,
      defaultValue: false,
      description: 'Search within previously selected element'
    }
  ],
  dependencies: [], // No dependencies
  outputs: ['selectedElement'] // Provides selectedElement for next operation
}
```

### Validation Rules

- `name` must be non-empty string
- `name` must be unique across all operations
- `description` should be non-empty (warning if missing)
- `parameters` array can be empty (operation takes no parameters)
- Each parameter name must be unique within the operation
- `dependencies` are property names (strings)
- `outputs` are property names (strings)

---

## 2. ParameterMetadata

Represents a single parameter of an Eligius operation.

### Structure

```typescript
interface ParameterMetadata {
  /**
   * Parameter name (e.g., "selector", "duration")
   * Used in parameter completion suggestions
   */
  name: string;

  /**
   * Parameter type from Eligius ParameterTypes enum
   * (e.g., "ParameterType:string", "ParameterType:number", "ParameterType:object")
   */
  type: string;

  /**
   * Whether this parameter is required
   * Used to mark required parameters in completion details
   */
  required: boolean;

  /**
   * Default value if parameter is optional
   * Shown in completion documentation
   */
  defaultValue?: unknown;

  /**
   * Human-readable parameter description
   * Extracted from JSDoc if available
   */
  description?: string;
}
```

### Example

```typescript
{
  name: 'animationDuration',
  type: 'ParameterType:number',
  required: true,
  description: 'Duration of animation in milliseconds'
}
```

### Type Mapping

Map Eligius `ParameterType` to human-readable types for completion details:

| Eligius Type | Display Type | Description |
|--------------|--------------|-------------|
| `ParameterType:string` | `string` | String value |
| `ParameterType:number` | `number` | Numeric value |
| `ParameterType:boolean` | `boolean` | Boolean value |
| `ParameterType:object` | `object` | Object literal |
| `ParameterType:array` | `array` | Array value |
| `ParameterType:selector` | `string (selector)` | CSS selector |
| `ParameterType:className` | `string (className)` | CSS class name |
| `ParameterType:htmlElementName` | `string (tagName)` | HTML tag name |
| `ParameterType:eventTopic` | `string (topic)` | Event topic |
| `ParameterType:url` | `string (url)` | URL string |
| `ParameterType:jQuery` | `jQuery` | jQuery object |
| `ParameterType:expression` | `string (expression)` | Expression string |

### Validation Rules

- `name` must be non-empty string
- `type` must be valid Eligius ParameterType
- If `required` is false, `defaultValue` should be provided (warning if missing)
- `description` is optional but recommended

---

## 3. TimelineEventMetadata

Represents a timeline event from Eligius `timeline-event-names.ts`.

### Structure

```typescript
interface TimelineEventMetadata {
  /**
   * Event name (e.g., "timeline-play", "timeline-pause")
   * Used as completion label
   */
  name: string;

  /**
   * Human-readable description from JSDoc comment
   * Shown in completion documentation
   */
  description: string;

  /**
   * Optional category for grouping
   * (e.g., "requests", "announcements", "factory")
   */
  category?: string;
}
```

### Example

```typescript
{
  name: 'timeline-play-request',
  description: 'Broadcasting this event will start the current timeline.',
  category: 'requests'
}
```

### Categories

Based on Eligius source code comments:

- **`requests`**: Timeline control requests (`PLAY_REQUEST`, `PAUSE_REQUEST`, `SEEK_REQUEST`, etc.)
- **`announcements`**: Timeline state announcements (`DURATION`, `TIME`, `SEEKED`, `PLAY`, `PAUSE`, etc.)
- **`factory`**: Factory and engine events (`REQUEST_INSTANCE`, `REQUEST_ACTION`, etc.)
- **`language`**: Language manager events (`REQUEST_LABEL_COLLECTION`, `LANGUAGE_CHANGE`, etc.)

### Validation Rules

- `name` must be non-empty string
- `name` must match Eligius `TimelineEventNames` static property
- `description` should be non-empty (warning if missing)
- `category` is optional but recommended for grouping

---

## 4. KeywordMetadata

Represents a DSL keyword for completion.

### Structure

```typescript
interface KeywordMetadata {
  /**
   * Keyword text (e.g., "action", "event", "if", "for", "break", "continue")
   */
  keyword: string;

  /**
   * Human-readable description of keyword purpose
   */
  description: string;

  /**
   * Optional context filter for when this keyword should appear
   * (e.g., "insideLoop" for break/continue)
   */
  contextFilter?: 'insideAction' | 'insideLoop' | 'insideEvent' | 'topLevel';
}
```

### Example

```typescript
[
  {
    keyword: 'action',
    description: 'Define a custom action',
    contextFilter: 'topLevel'
  },
  {
    keyword: 'if',
    description: 'Conditional execution',
    contextFilter: 'insideAction'
  },
  {
    keyword: 'break',
    description: 'Exit current loop',
    contextFilter: 'insideLoop'
  },
  {
    keyword: 'continue',
    description: 'Skip to next loop iteration',
    contextFilter: 'insideLoop'
  }
]
```

### All Keywords

| Keyword | Description | Context Filter |
|---------|-------------|----------------|
| `action` | Define a custom action | `topLevel` |
| `event` | Define an event handler | `topLevel` |
| `if` | Conditional execution | `insideAction` |
| `else` | Alternative branch | `insideAction` (after `if`) |
| `for` | Loop over collection | `insideAction` |
| `break` | Exit current loop | `insideLoop` |
| `continue` | Skip to next iteration | `insideLoop` |

### Validation Rules

- `keyword` must be non-empty string
- `keyword` must match DSL grammar keywords
- `description` should be concise (1-2 sentences)
- `contextFilter` determines when keyword appears in completions

---

## 5. VariableMetadata

Represents a variable reference available in Eligian DSL (prefixed with `@@`).

### Structure

```typescript
interface VariableMetadata {
  /**
   * Variable name without @@ prefix (e.g., "currentItem", "timeline")
   */
  name: string;

  /**
   * Variable type (for display in completion detail)
   */
  type: string;

  /**
   * Variable scope (where it's available)
   */
  scope: 'loop' | 'action' | 'global';

  /**
   * Human-readable description of variable purpose
   */
  description: string;
}
```

### Example

```typescript
[
  {
    name: 'currentItem',
    type: 'any',
    scope: 'loop',
    description: 'Current item in forEach loop iteration'
  },
  {
    name: 'loopIndex',
    type: 'number',
    scope: 'loop',
    description: 'Current loop iteration index (0-based)'
  },
  {
    name: 'loopLength',
    type: 'number',
    scope: 'loop',
    description: 'Total number of items in loop'
  },
  {
    name: 'timeline',
    type: 'Timeline',
    scope: 'global',
    description: 'Current timeline instance'
  },
  {
    name: 'context',
    type: 'object',
    scope: 'global',
    description: 'Shared context data across timeline'
  }
]
```

### All Variables (from Eligius IOperationScope)

| Variable | Type | Scope | Description |
|----------|------|-------|-------------|
| `@@currentItem` | `any` | `loop` | Current item in forEach loop |
| `@@loopIndex` | `number` | `loop` | Current loop index (0-based) |
| `@@loopLength` | `number` | `loop` | Total loop iterations |
| `@@timeline` | `Timeline` | `global` | Current timeline instance |
| `@@context` | `object` | `global` | Shared context data |
| `@@variables` | `object` | `global` | Custom variables (user-defined) |

### Validation Rules

- `name` must be non-empty string
- `type` should reflect actual TypeScript type from Eligius
- `scope` determines when variable appears in completions (e.g., `@@currentItem` only in loops)
- `description` should explain when/how to use the variable

---

## 6. CompletionContext

Represents the cursor context for determining which completions to show.

### Structure

```typescript
interface CompletionContext {
  /**
   * AST node at cursor position (from Langium)
   */
  cursorNode?: AstNode;

  /**
   * Is cursor inside a for loop?
   * Determines if break/continue keywords should appear
   */
  isInsideLoop: boolean;

  /**
   * Is cursor inside an action block?
   * Determines if operations/actions should appear
   */
  isInsideAction: boolean;

  /**
   * Is cursor inside an event definition?
   * Determines if event names should appear
   */
  isInsideEvent: boolean;

  /**
   * Is cursor after a variable prefix (@@)?
   * Determines if variable names should appear
   */
  isAfterVariablePrefix: boolean;

  /**
   * Is cursor inside an operation call?
   * If set, contains the operation name for parameter completion
   */
  insideOperationCall?: string;

  /**
   * Expected type at cursor (for type-specific completions)
   */
  expectedType?: string;

  /**
   * Langium document being edited
   */
  document: LangiumDocument;

  /**
   * Cursor position (line, character)
   */
  position: Position;
}
```

### Example

```typescript
// Cursor inside action block:
{
  cursorNode: ActionDefinition,
  isInsideLoop: false,
  isInsideAction: true,
  isInsideEvent: false,
  isAfterVariablePrefix: false,
  document: /* ... */,
  position: { line: 5, character: 10 }
}

// Cursor inside for loop:
{
  cursorNode: ForEachLoop,
  isInsideLoop: true,
  isInsideAction: true,  // Loops are inside actions
  isInsideEvent: false,
  isAfterVariablePrefix: false,
  document: /* ... */,
  position: { line: 8, character: 12 }
}

// Cursor after @@:
{
  cursorNode: OperationCall,
  isInsideLoop: false,
  isInsideAction: true,
  isInsideEvent: false,
  isAfterVariablePrefix: true,
  document: /* ... */,
  position: { line: 6, character: 15 }
}
```

### Context Detection Logic

```typescript
function detectContext(
  document: LangiumDocument,
  position: Position
): CompletionContext {
  const offset = document.textDocument.offsetAt(position);
  const cstNode = CstUtils.findLeafNodeAtOffset(
    document.parseResult.value.$cstNode,
    offset
  );
  const cursorNode = cstNode?.astNode;

  return {
    cursorNode,
    isInsideLoop: !!AstUtils.getContainerOfType(cursorNode, isForEachLoop),
    isInsideAction: !!AstUtils.getContainerOfType(cursorNode, isActionDefinition),
    isInsideEvent: !!AstUtils.getContainerOfType(cursorNode, isEventDefinition),
    isAfterVariablePrefix: detectVariablePrefix(document, offset),
    insideOperationCall: detectOperationCall(cursorNode),
    document,
    position
  };
}
```

---

## 7. Generated Registry Files

### File: `packages/extension/src/metadata/operations.generated.ts`

**Generated by**: `.specify/scripts/powershell/generate-metadata.ps1`
**Source**: `../eligius/src/operation/metadata/*.ts`

```typescript
export interface OperationMetadata {
  name: string;
  description: string;
  parameters: ParameterMetadata[];
  dependencies: string[];
  outputs: string[];
}

export interface ParameterMetadata {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

/**
 * All Eligius operations (alphabetically sorted)
 */
export const OPERATIONS: OperationMetadata[] = [
  // Generated from Eligius metadata
  // Example:
  {
    name: 'addClass',
    description: 'Adds CSS class(es) to selected element',
    parameters: [
      {
        name: 'className',
        type: 'ParameterType:className',
        required: true,
        description: 'Class name or space-separated class names'
      }
    ],
    dependencies: ['selectedElement'],
    outputs: []
  },
  // ... all operations
];

/**
 * Operations filtered from completions (handled by DSL keywords)
 */
export const FILTERED_OPERATIONS = new Set([
  'breakForEach',
  'continueForEach',
  'ifCondition',
  'elseCondition',
  'forEach'
]);
```

### File: `packages/extension/src/metadata/timeline-events.generated.ts`

**Generated by**: `.specify/scripts/powershell/generate-metadata.ps1`
**Source**: `../eligius/src/timeline-event-names.ts`

```typescript
export interface TimelineEventMetadata {
  name: string;
  description: string;
  category?: string;
}

/**
 * All Eligius timeline events (alphabetically sorted)
 */
export const TIMELINE_EVENTS: TimelineEventMetadata[] = [
  // Generated from TimelineEventNames class
  // Example:
  {
    name: 'timeline-play-request',
    description: 'Broadcasting this event will start the current timeline.',
    category: 'requests'
  },
  // ... all events
];
```

---

## 8. Completion Item Structure (LSP)

### VS Code CompletionItem

```typescript
interface CompletionItem {
  /**
   * Display label in completion list
   */
  label: string;

  /**
   * Icon/category in completion list
   */
  kind?: CompletionItemKind;

  /**
   * Additional details shown to the right of label
   * (e.g., parameter signature)
   */
  detail?: string;

  /**
   * Full documentation shown in detail panel
   * Supports markdown
   */
  documentation?: string | MarkupContent;

  /**
   * Sort order (lexicographic)
   * Use prefix to control ordering (e.g., "1_operation", "2_action")
   */
  sortText?: string;

  /**
   * Text to insert when completion is accepted
   * If undefined, uses label
   */
  insertText?: string;

  /**
   * Text edit to apply
   * More powerful than insertText (can replace ranges)
   */
  textEdit?: TextEdit;

  /**
   * Preselect this item in the list
   */
  preselect?: boolean;

  /**
   * Tags (e.g., deprecated)
   */
  tags?: CompletionItemTag[];
}
```

### Completion Item Examples

**Operation Completion**:
```typescript
{
  label: 'selectElement',
  kind: CompletionItemKind.Function, // Function icon
  sortText: '1_selectElement', // Sort with operations group
  detail: 'Eligius operation',
  documentation: {
    kind: 'markdown',
    value: `
### selectElement

Select a DOM element by CSS selector.

**Parameters:**
- \`selector\`: string (required) - CSS selector
- \`useSelectedElementAsRoot\`: boolean (optional, default: false) - Search within selected element

**Provides:**
- \`selectedElement\`: DOMElement
    `.trim()
  }
}
```

**Custom Action Completion**:
```typescript
{
  label: 'fadeIn',
  kind: CompletionItemKind.Class, // Class icon (distinguishes from operations)
  sortText: '2_fadeIn', // Sort after operations
  detail: 'Custom action (selector: string, duration: number)',
  documentation: 'User-defined action for fading in elements'
}
```

**Keyword Completion**:
```typescript
{
  label: 'break',
  kind: CompletionItemKind.Keyword, // Keyword icon
  sortText: '0_break', // Sort before operations
  detail: 'Exit current loop',
  documentation: 'Exit the current `for` loop immediately'
}
```

**Variable Completion**:
```typescript
{
  label: '@@currentItem',
  kind: CompletionItemKind.Variable, // Variable icon
  sortText: 'var_currentItem',
  detail: 'any (loop context)',
  documentation: 'Current item in `for` loop iteration'
}
```

**Parameter Completion**:
```typescript
{
  label: 'selector',
  kind: CompletionItemKind.Property, // Property icon
  sortText: 'param_selector',
  detail: 'string (required)',
  documentation: 'CSS selector to find elements',
  insertText: 'selector: '  // Insert with colon, ready for value
}
```

---

## Summary

This data model provides a complete structure for all completion metadata in the Eligian DSL:

1. **OperationMetadata**: Eligius operations with parameters, dependencies, outputs
2. **ParameterMetadata**: Operation/action parameters with types and defaults
3. **TimelineEventMetadata**: Timeline events with categories
4. **KeywordMetadata**: DSL keywords with context filtering
5. **VariableMetadata**: Variable references with scope information
6. **CompletionContext**: Cursor context for intelligent filtering
7. **Generated Registries**: Build-time generated TypeScript modules
8. **CompletionItem**: LSP structure for VS Code integration

All entities are designed for:
- **Type safety**: TypeScript interfaces with validation rules
- **Performance**: Cached registries, lazy loading
- **Extensibility**: Easy to add new operations/events/variables
- **Testability**: Simple structures, pure functions
- **Documentation**: Rich markdown support for developer experience
