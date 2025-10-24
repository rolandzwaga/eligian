# API Contracts: Custom Action Code Completions

**Feature**: 008-custom-action-code
**Phase**: 1 - Design Artifacts

---

## Overview

This feature extends the existing Langium `CompletionProvider` API. No new API contracts are defined - the feature uses standard LSP `CompletionItem` interface.

---

## LSP CompletionItem Interface

**Source**: `vscode-languageserver-types` v3.17.5

**Reference**: Standard LSP 3.17 specification

```typescript
export interface CompletionItem {
  label: string;
  insertText?: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | MarkupContent;
  sortText?: string;
  filterText?: string;
  textEdit?: TextEdit;
  // ... other properties (see LSP spec)
}
```

**Usage in This Feature**:
- `label`: Display text with prefix (e.g., "operation: selectElement")
- `insertText`: Insertion text without prefix (e.g., "selectElement")
- `kind`: Always `CompletionItemKind.Function` (value: 3)

---

## Langium CompletionProvider Interface

**Source**: Langium 3.x framework

**Method Extended**:

```typescript
protected completionFor(
  context: CompletionContext,
  next: NextFeature,
  acceptor: CompletionAcceptor
): MaybePromise<void>
```

**Parameters**:
- `context`: Completion context (document, position, AST node)
- `next`: Next feature in completion chain
- `acceptor`: Function to add completion items

**Implementation Pattern**:

```typescript
protected override completionFor(
  context: CompletionContext,
  next: NextFeature,
  acceptor: CompletionAcceptor
): MaybePromise<void> {
  // 1. Add custom action completions
  this.addActionCompletions(context, acceptor);

  // 2. Call super to add operation completions
  return super.completionFor(context, next, acceptor);
}
```

---

## No New Contracts

This feature **does not define new API contracts**. It extends existing Langium/LSP interfaces:

1. **CompletionProvider**: Langium's existing completion provider (override `completionFor`)
2. **CompletionItem**: Standard LSP interface (used as-is)
3. **ActionDefinition**: Existing AST type from Eligian grammar

---

## Integration Points

### Input

**From Langium**:
- `CompletionContext` - Document, position, AST node at cursor

**From Document**:
- `Program.elements` - All top-level declarations (actions, timeline)

**From Registry**:
- `OPERATION_REGISTRY` - Built-in operation metadata

### Output

**To Langium LSP**:
- Array of `CompletionItem` objects via `acceptor(context, item)`

**To VS Code**:
- LSP `CompletionList` response (handled automatically by Langium)

---

## Reference Documentation

- **LSP Specification**: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
- **Langium Documentation**: https://langium.org/docs/
- **CompletionItem Interface**: `node_modules/vscode-languageserver-types/lib/esm/main.d.ts` (lines 1336-1503)

---

## Summary

No new contracts required. Feature uses standard LSP and Langium APIs. See `data-model.md` for data structures and transformations.
