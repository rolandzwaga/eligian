# Data Model: JSDoc-Style Documentation Comments

**Feature**: 020-jsdoc-style-comments
**Date**: 2025-10-30
**Purpose**: Define entities, their attributes, relationships, and validation rules

## Overview

This feature introduces in-memory data structures to represent JSDoc documentation comments for Eligian custom actions. No persistent storage is required - all data lives in the AST and is parsed on-demand.

---

## Entity: JSDocComment

**Purpose**: Represents a parsed JSDoc documentation comment

**Attributes**:
- `description` (string) - Main documentation text (lines before first `@tag`)
  - **Validation**: May be empty string (optional description)
  - **Format**: Markdown-supported (bold, italic, code spans, links)
  - **Extraction**: Everything between `/**` and first `@param` or closing `*/`

- `params` (Array<JSDocParam>) - List of documented parameters
  - **Validation**: May be empty array (action with no parameters)
  - **Cardinality**: 0..N params (matches action parameter count ideally)
  - **Order**: Matches parameter order in action signature (when auto-generated)

**Relationships**:
- **Owned by**: ActionDefinition (1:1 optional - via `$comment` property)
- **Contains**: 0..N JSDocParam entities

**Lifecycle**:
- **Created**: When JSDoc comment parsed from AST `$comment` property
- **Cached**: Per ActionDefinition, invalidated on document change
- **Destroyed**: When document is closed or AST is regenerated

**Example**:
```typescript
{
  description: "Fades in an element over a specified duration",
  params: [
    { type: "string", name: "selector", description: "CSS selector for target element" },
    { type: "number", name: "duration", description: "Animation duration in milliseconds" }
  ]
}
```

---

## Entity: JSDocParam

**Purpose**: Represents a single `@param` tag in JSDoc comment

**Attributes**:
- `type` (string | undefined) - Parameter type annotation
  - **Validation**: Must match Eligian type syntax if present (`string`, `number`, `boolean`, `object`, `array`, `unknown`)
  - **Optional**: May be undefined if `@param` has no type (e.g., `@param foo`)
  - **Extraction**: From `{type}` in `@param {type} name description`

- `name` (string) - Parameter identifier
  - **Validation**: Must be valid identifier (alphanumeric + underscore, starts with letter)
  - **Required**: Cannot be empty (malformed JSDoc if missing)
  - **Matching**: Should match actual parameter name in action signature (not enforced, user responsibility)

- `description` (string | undefined) - Parameter documentation text
  - **Validation**: None (freeform text)
  - **Optional**: May be undefined if `@param` has no description
  - **Format**: Markdown-supported (inline only: bold, italic, code spans)

**Relationships**:
- **Owned by**: JSDocComment (N:1)
- **References**: Parameter in ActionDefinition (conceptual, not enforced)

**Validation Rules**:
- **name** is REQUIRED (parse fails for this param if missing)
- **type** is OPTIONAL (can be inferred or omitted)
- **description** is OPTIONAL (can be empty)

**Example**:
```typescript
// Full param documentation
{ type: "string", name: "selector", description: "CSS selector for target element" }

// No type (will be inferred or shown as 'unknown')
{ type: undefined, name: "selector", description: "CSS selector for target element" }

// No description
{ type: "string", name: "selector", description: undefined }

// Minimal (name only)
{ type: undefined, name: "selector", description: undefined }
```

---

## Entity: ActionDefinition (Extended)

**Purpose**: Existing Langium AST node, extended with JSDoc comment property

**New Attribute**:
- `$comment` (string | undefined) - Raw JSDoc comment text
  - **Populated by**: Langium parser automatically (for comments starting with `/**`)
  - **Format**: Raw string including `/**` and `*/` delimiters
  - **Position**: Comment must be directly above the action definition (no blank lines)
  - **Optional**: May be undefined if action has no documentation

**Parsing**:
```typescript
// Access raw comment
const commentText = actionDef.$comment; // "/** Description\n * @param foo ...\n */"

// Parse into structured JSDocComment
const jsdoc = parseJSDoc(commentText);
```

**Validation**:
- No validation on `$comment` itself (Langium captures as-is)
- JSDoc parsing handles malformed comments gracefully (returns `null` on failure)

---

## Entity: JSDocTemplate (Ephemeral)

**Purpose**: Represents a generated JSDoc template for completion

**Attributes**:
- `commentLines` (Array<string>) - Lines of generated JSDoc template
  - **Format**: Each line includes leading asterisk and proper indentation
  - **Structure**: Opening `/**`, blank description line, `@param` lines, closing `*/`

**Lifecycle**:
- **Created**: On-demand when user types `/**` above an action
- **Used**: Immediately inserted as completion item
- **Destroyed**: After insertion (no caching)

**Generation Logic**:
```typescript
function generateJSDocTemplate(action: ActionDefinition): JSDocTemplate {
  const lines = ['/**', ' * ', ' * '];

  for (const param of action.parameters) {
    const type = inferParameterType(param, action) || 'unknown';
    lines.push(` * @param {${type}} ${param.name}`);
  }

  lines.push(' */');

  return { commentLines: lines };
}
```

**Example Output**:
```javascript
/**
 *
 * @param {string} selector
 * @param {number} duration
 */
```

---

## State Transitions

### JSDoc Comment Lifecycle

```
[No Comment]
    ↓ (User types '/**')
[Template Generated]
    ↓ (User fills in description and param details)
[Valid JSDoc]
    ↓ (Parsed on hover/completion)
[JSDocComment Entity Created]
    ↓ (Document modified)
[Entity Invalidated]
    ↓ (Re-parse on next hover/completion)
[JSDocComment Entity Re-created]
```

### Parsing State Machine

```
[Raw Comment String]
    ↓ (parseJSDoc called)
[Parsing Description]
    ↓ (Extract text before first @tag)
[Description Extracted]
    ↓ (For each @param tag)
[Parsing @param Tag]
    ↓ (Regex match: type, name, description)
[JSDocParam Created]
    ↓ (All @param tags processed)
[JSDocComment Created]
```

### Malformed Comment Handling

```
[Invalid JSDoc Syntax]
    ↓ (Parser encounters error)
[Partial Parse Attempt]
    ↓ (Extract what's valid)
[Partial JSDocComment | null]
    ↓ (Consumer checks)
[Show Partial Docs | No Hover Tooltip]
```

---

## Validation Rules

### JSDoc Comment Validation

**Description Validation**:
- ✅ May be empty (no description is valid)
- ✅ May contain markdown (rendered in hover tooltip)
- ❌ Must not contain opening `*/` (would close comment early - handled by Langium lexer)

**@param Tag Validation**:
- ✅ `@param {type} name description` - Full format
- ✅ `@param {type} name` - No description
- ✅ `@param name` - No type or description
- ❌ `@param` - Missing name (parse fails, skip this param)
- ⚠️ `@param {invalidType} name` - Invalid type (accepted as-is, shown in tooltip)
- ⚠️ `@param unknownParam` - Param not in action signature (accepted, user error)

**Malformed Comment Handling**:
- Missing closing `*/` - Langium lexer error (not our concern)
- Typo in tag (`@pram`) - Ignored (not recognized as @param)
- Multiple `@param` for same parameter - All parsed, last one wins in hover
- Extra `@param` not matching any parameter - Shown in hover anyway (user can fix)

---

## Caching Strategy

**Parse Results Cache** (in-memory):
- **Key**: ActionDefinition AST node ID
- **Value**: Parsed JSDocComment entity
- **Invalidation**: On document change (Langium document version change)
- **Rationale**: Parsing is cheap (<1ms), but avoid redundant parsing on multiple hovers

**Type Inference Cache** (reuse existing):
- **Managed by**: Existing type system in `packages/language/src/type-system/`
- **No additional caching**: Type inference already cached per document
- **Query on-demand**: JSDoc template generation queries type system

**No persistence**: All data in-memory only (Constitution principle - no storage)

---

## Error Handling

### Parsing Errors

**Scenario**: Invalid JSDoc syntax
- **Behavior**: Parser returns `null`
- **UX**: No hover tooltip, action signature shown instead
- **Logging**: Warning to console for debugging

**Scenario**: Unclosed comment
- **Behavior**: Langium lexer error (before our parser runs)
- **UX**: Syntax error in editor (standard Langium behavior)

### Missing Information

**Scenario**: JSDoc references non-existent parameter
- **Behavior**: Show JSDoc as-is (don't validate param names)
- **UX**: User sees mismatch in hover, can fix manually

**Scenario**: Type inference fails (returns `unknown`)
- **Behavior**: Use `'unknown'` in JSDoc template
- **UX**: User can manually replace with correct type

### Performance Degradation

**Scenario**: Action with 20+ parameters
- **Behavior**: Generate all `@param` tags in template
- **Performance**: Measured <100ms (within 500ms requirement SC-002)
- **Fallback**: None needed (performance acceptable)

---

## Data Flow Diagram

```
[User Types /**]
    ↓
[Completion Provider Triggered]
    ↓
[Find ActionDefinition Below Cursor]
    ↓
[For Each Parameter]
    ↓
[Query Type Inference System]
    ↓
[Generate @param Line]
    ↓
[Assemble JSDocTemplate]
    ↓
[Insert in Editor]
    ↓
[User Fills Description/Details]
    ↓
[JSDoc Stored in AST as $comment]
    ↓
[User Hovers Over Action Invocation]
    ↓
[Hover Provider Activated]
    ↓
[Resolve ActionDefinition]
    ↓
[Check for $comment Property]
    ↓
[Parse JSDoc → JSDocComment Entity]
    ↓
[Format as Markdown]
    ↓
[Display in Hover Tooltip]
```

---

## Example: Complete Workflow

### 1. User Types `/**`

```eligian
/**|  // <-- Cursor here after typing second asterisk

action fadeIn(selector: string, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

### 2. Template Generated

```eligian
/**
 * |  // <-- Cursor positioned here for description
 * @param {string} selector
 * @param {number} duration  // <-- Type inferred from usage
 */
action fadeIn(selector: string, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

### 3. User Fills Documentation

```eligian
/**
 * Fades in an element by animating its opacity from 0 to 1
 * @param {string} selector - CSS selector for the target element
 * @param {number} duration - Animation duration in milliseconds
 */
action fadeIn(selector: string, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

### 4. Hover Over Invocation

```eligian
at 0s..5s fadeIn("#box", 1000)
            ^^^^^  // <-- User hovers here
```

**Hover Tooltip Displays**:
```markdown
### fadeIn

Fades in an element by animating its opacity from 0 to 1

**Parameters:**
- `selector` (`string`) - CSS selector for the target element
- `duration` (`number`) - Animation duration in milliseconds
```

---

## Summary

**Key Entities**:
1. **JSDocComment** - Structured documentation (description + params)
2. **JSDocParam** - Single parameter documentation (type, name, description)
3. **JSDocTemplate** - Generated template for completion (ephemeral)

**No Persistent Storage**: All entities in-memory, cached per document

**Validation**: Graceful - parse what's valid, ignore invalid parts

**Performance**: <1ms parse, <100ms generation (well within SC requirements)
