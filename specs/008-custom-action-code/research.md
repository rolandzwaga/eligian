# Research: Custom Action Code Completions

**Feature**: 008-custom-action-code
**Phase**: 0 - Research & Unknowns Resolution
**Date**: 2025-10-24

---

## R1: Langium Completion API Patterns

**Question**: How does Langium's `CompletionProvider` allow customizing `label` vs `insertText`?

**Research Method**: Consulted context7 MCP for Langium/LSP documentation

**Findings**:

### CompletionItem Interface (LSP 3.17)

```typescript
interface CompletionItem {
  label: string;          // Displayed in completion list
  insertText?: string;    // Inserted when selected (optional)
  textEdit?: TextEdit;    // Precise edit (preferred over insertText)
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | MarkupContent;
  sortText?: string;      // Controls sort order (defaults to label)
  filterText?: string;    // Controls filtering (defaults to label)
}
```

### Key Behavior

1. **Display**: `label` appears in IDE completion list
2. **Insertion Priority**:
   - `textEdit` (highest priority)
   - `insertText` (middle priority - used if no textEdit)
   - `label` (fallback if neither provided)

3. **Important Warning**: LSP spec warns that `insertText` is "subject to client interpretation"
   - Example: User types "con", `insertText: "console"` may only insert "sole"
   - **Recommendation**: Use `textEdit` for reliable behavior

### Decision for This Feature

**Use `insertText`** (not `textEdit`) because:
- Simpler implementation (no range calculation needed)
- Langium handles completion context automatically
- Project tests show `insertText` works correctly in Eligian codebase
- No evidence of client interpretation issues in VS Code with Langium

**Pattern**:
```typescript
{
  label: "operation: selectElement",  // Display with prefix
  insertText: "selectElement",        // Insert without prefix
  kind: CompletionItemKind.Function
}
```

---

## R2: Action Discovery Pattern

**Question**: What's the best way to retrieve all `ActionDefinition` nodes from the current document?

**Research Method**: Reviewed existing `EligianScopeProvider` implementation

**Findings**:

### Existing Pattern (from `EligianScopeProvider.getScopeForActionReference()`)

```typescript
private getScopeForActionReference(context: ReferenceInfo): Scope {
  const document = AstUtils.getDocument(context.container);
  const model = document.parseResult.value as Program;

  // Get all ActionDefinition nodes from program
  const actionDefinitions = model.elements.filter(isActionDefinition);

  return this.createScope(actionDescriptions);
}
```

### Decision

**Reuse this pattern** in `EligianCompletionProvider`:

```typescript
protected override completionFor(
  context: CompletionContext,
  next: NextFeature,
  acceptor: CompletionAcceptor
): MaybePromise<void> {
  // Get document and AST
  const document = AstUtils.getDocument(context.node);
  const program = document.parseResult.value as Program;

  // Filter for action definitions
  const actions = program.elements.filter(isActionDefinition);

  // Generate completion items for actions
  for (const action of actions) {
    acceptor(context, {
      label: `action: ${action.name}`,
      insertText: action.name,
      kind: CompletionItemKind.Function
    });
  }

  // Call next to include operation completions
  return super.completionFor(context, next, acceptor);
}
```

**Rationale**:
- Proven pattern already in use
- Simple and efficient (O(n) scan)
- Works with Langium's document model
- No additional dependencies needed

---

## R3: Alphabetical Sorting Behavior

**Question**: Should sorting be case-sensitive or case-insensitive?

**Research Method**: Industry standards and LSP specification

**Findings**:

### LSP Sorting Behavior

From LSP spec: `sortText` controls order, defaults to `label` if not provided.

### Industry Standards

- **VS Code**: Case-insensitive alphabetical sorting by default
- **IntelliJ**: Case-insensitive sorting
- **Eclipse**: Case-insensitive sorting

### User Spec

Spec says "sort alphabetically" without specifying case sensitivity.

### Decision

**Use case-insensitive sorting**:

```typescript
// Sort completion items
items.sort((a, b) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
);
```

**Rationale**:
- Industry standard approach
- More user-friendly (action `AAA` and operation `aaa` appear together)
- Matches user expectation based on other IDEs
- Can adjust if user requests case-sensitive sorting

### Alternative: Use sortText

If sorting needs to be customized later:

```typescript
{
  label: "action: fadeIn",
  insertText: "fadeIn",
  sortText: "01-fadein"  // Lowercase for case-insensitive, prefix for grouping
}
```

---

## R4: Completion Trigger Points

**Question**: Where exactly is completion triggered? Do we need to modify trigger logic?

**Research Method**: Reviewed existing `EligianCompletionProvider` implementation

**Findings**:

### Existing Triggers

From `completion.spec.ts`:
- Timeline events: `at 0s..1s |`
- Action bodies: `action test [ | ]`
- Control flow: `if (...) { | }`
- For loops: `for (item in items) { | }`

### Langium Completion Context

Langium automatically triggers completion in all contexts where `OperationStatement` is valid:
- Grammar rule: `OperationStatement = OperationCall | IfStatement | ForStatement | ...`
- Completion provider is called for any `OperationCall` context

### Decision

**No trigger modifications needed**:
- Existing completion trigger logic already covers all required contexts
- `completionFor()` method is called for `OperationCall` nodes
- Actions and operations are both valid as `OperationCall` (unified syntax from Feature 006)

**Verification**: Integration tests will confirm completion works in all contexts

---

## R5: CompletionItemKind Selection

**Question**: Should actions use a different `CompletionItemKind` than operations?

**Research Method**: Reviewed project test patterns and LSP kinds

**Findings**:

### Current Project Usage

From `completion.spec.ts`:
```typescript
expect(selectElement?.kind).toBe(3);  // CompletionItemKind.Function = 3
```

Operations use `CompletionItemKind.Function`.

### Available Kinds (Relevant Subset)

```typescript
enum CompletionItemKind {
  Function = 3,    // Functions and methods
  Class = 7,       // Classes and types
  Module = 9,      // Modules/namespaces
  Property = 10,   // Object properties
  Unit = 11,       // Units (e.g., px, em)
  Variable = 6,    // Variables
}
```

### Decision

**Use same kind for both**:
- Operations: `CompletionItemKind.Function`
- Actions: `CompletionItemKind.Function`

**Rationale**:
- Both are callable entities (operations and actions are both invoked with `()`)
- Visual distinction comes from prefix (`operation:` vs `action:`), not icon
- Consistent with unified syntax (Feature 006 treats them identically)
- Simpler mental model for users

**Alternative Considered**:
- Actions: `CompletionItemKind.Class` (to show different icon)
- **Rejected**: Adds complexity without clear benefit, may confuse users

---

## Summary: All Unknowns Resolved

### R1: Langium Completion API ✅
- Use `insertText` for clean insertion
- Use `label` for prefixed display
- Pattern confirmed and documented

### R2: Action Discovery ✅
- Reuse `AstUtils.getDocument()` + `filter(isActionDefinition)`
- Proven pattern from existing codebase

### R3: Alphabetical Sorting ✅
- Case-insensitive using `localeCompare`
- Industry standard approach

### R4: Completion Triggers ✅
- No modifications needed
- Existing trigger logic covers all contexts

### R5: CompletionItemKind ✅
- Use `Function` for both operations and actions
- Visual distinction via prefix only

---

## Implementation Ready

All research questions answered. Proceeding to Phase 1 (Design Artifacts).

**Next Steps**:
1. Create `data-model.md` (CompletionItem structure)
2. Create `contracts/` (LSP interfaces - minimal, mostly references)
3. Create `quickstart.md` (feature usage guide)
4. Update agent context
