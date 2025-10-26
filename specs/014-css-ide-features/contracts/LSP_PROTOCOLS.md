# LSP Protocol Contracts: CSS IDE Features

**Date**: 2025-10-26
**Purpose**: Document Language Server Protocol contracts used by CSS IDE features

## Overview

This feature uses **standard LSP protocols** provided by Langium and the Language Server Protocol specification. No custom notifications or commands are needed - all functionality is implemented via standard LSP requests.

---

## Standard LSP Protocols Used

### 1. `textDocument/completion`

**Purpose**: Provide autocomplete suggestions for CSS classes and IDs

**Request Flow**:
1. User types in VSCode editor
2. VSCode client sends `textDocument/completion` request to language server
3. Language server invokes registered `CompletionProvider`
4. Provider queries CSSRegistry and returns `CompletionItem[]`
5. VSCode shows completion dropdown to user

**Request Params**:
```typescript
interface CompletionParams {
  textDocument: TextDocumentIdentifier;  // Document URI
  position: Position;                     // Cursor position (line, character)
  context?: CompletionContext;            // Trigger kind, character
}
```

**Response**:
```typescript
type CompletionList = CompletionItem[] | {
  isIncomplete: boolean;
  items: CompletionItem[];
};

interface CompletionItem {
  label: string;                      // "button"
  kind?: CompletionItemKind;          // Property
  detail?: string;                    // "CSS class"
  documentation?: string | MarkupContent;
  sortText?: string;                  // "0_button"
  filterText?: string;                // Optional filter text
  insertText?: string;                // "button"
  insertTextFormat?: InsertTextFormat; // PlainText or Snippet
}
```

**Langium Integration**:
- Implemented via `CompletionProvider` service
- Registered in `EligianModule.lsp.CompletionProvider`
- Uses `CompletionAcceptor` callback to add items

**CSS-Specific Behavior**:
- `CompletionItemKind.Property` for CSS classes/IDs
- `sortText` prefix with `"0_"` to rank higher than operations
- No custom completion item properties needed

---

### 2. `textDocument/hover`

**Purpose**: Show CSS file location and rule preview when hovering over class names

**Request Flow**:
1. User hovers mouse over text in VSCode
2. VSCode client sends `textDocument/hover` request to language server
3. Language server invokes registered `HoverProvider`
4. Provider queries CSSRegistry and returns `Hover` with markdown content
5. VSCode shows tooltip with formatted markdown

**Request Params**:
```typescript
interface HoverParams {
  textDocument: TextDocumentIdentifier;  // Document URI
  position: Position;                     // Hover position (line, character)
}
```

**Response**:
```typescript
interface Hover {
  contents: MarkupContent | string;  // Markdown content
  range?: Range;                      // Optional highlight range
}

interface MarkupContent {
  kind: MarkupKind;    // "markdown" or "plaintext"
  value: string;       // Markdown string
}
```

**Langium Integration**:
- Implemented via `AstNodeHoverProvider` base class
- Registered in `EligianModule.lsp.HoverProvider`
- Overrides `getAstNodeHoverContent(node, params)`

**CSS-Specific Behavior**:
- Uses `MarkupKind.Markdown` for rich formatting
- Includes code fences for CSS syntax highlighting
- No custom hover properties needed

---

### 3. `textDocument/codeAction`

**Purpose**: Provide quick fix actions to create missing CSS classes

**Request Flow**:
1. User triggers quick fix (lightbulb click or Ctrl+.)
2. VSCode client sends `textDocument/codeAction` request to language server
3. Language server invokes registered `CodeActionProvider`
4. Provider filters diagnostics and returns `CodeAction[]` with `WorkspaceEdit`
5. VSCode shows code action menu
6. When selected, VSCode applies `WorkspaceEdit` (modifies CSS file)

**Request Params**:
```typescript
interface CodeActionParams {
  textDocument: TextDocumentIdentifier;   // Document URI
  range: Range;                            // Selected range or diagnostic range
  context: CodeActionContext;              // Diagnostics, trigger kind
}

interface CodeActionContext {
  diagnostics: Diagnostic[];               // Validation errors in range
  only?: CodeActionKind[];                 // Requested action kinds
  triggerKind?: CodeActionTriggerKind;     // Manual/Auto
}
```

**Response**:
```typescript
type CodeAction = {
  title: string;                           // "Create '.button' in styles.css"
  kind?: CodeActionKind;                   // QuickFix
  diagnostics?: Diagnostic[];              // Links to specific errors
  isPreferred?: boolean;                   // Mark as preferred fix
  edit?: WorkspaceEdit;                    // Text edits to apply
  command?: Command;                       // Alternative: execute command
};

interface WorkspaceEdit {
  changes?: {
    [uri: string]: TextEdit[];            // file:///path/to/styles.css -> [edits]
  };
  documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[];
}

interface TextEdit {
  range: Range;                            // Insertion position
  newText: string;                         // CSS rule to insert
}
```

**Langium Integration**:
- Implemented via `CodeActionProvider` interface
- Registered in `EligianModule.lsp.CodeActionProvider`
- Implements `getCodeActions(document, params)`

**CSS-Specific Behavior**:
- Filters diagnostics with code `'css-unknown-class'`
- Returns `CodeActionKind.QuickFix` actions
- Uses `WorkspaceEdit.changes` (simpler than `documentChanges`)
- Inserts at end of CSS file (safe location)

---

## Custom Notifications (None Required)

This feature does **NOT** introduce any custom LSP notifications. All functionality uses standard LSP protocols.

**Why No Custom Notifications?**:
- Feature 013 already handles `css/updated` notifications for CSS hot-reload
- Standard LSP protocols cover all use cases:
  - Completion: `textDocument/completion`
  - Hover: `textDocument/hover`
  - Quick Fix: `textDocument/codeAction`
- Custom notifications would add complexity without benefit

---

## Provider Registration Pattern

All providers are registered in the Langium services module:

```typescript
// In eligian-module.ts or similar

export const EligianModule: Module<EligianServices, PartialLangiumServices> = {
  lsp: {
    // Completion provider (integrates CSS completion)
    CompletionProvider: (services) => new EligianCompletionProvider(services),

    // Hover provider (integrates CSS hover)
    HoverProvider: (services) => new EligianHoverProvider(services),

    // Code action provider (integrates CSS quick fixes)
    CodeActionProvider: (services) => new EligianCodeActionProvider(services)
  },
  // ... other services
};
```

**Integration Patterns**:

1. **Option A: Extend Existing Providers**
   - Modify `EligianCompletionProvider` to call CSS completion logic
   - Modify `EligianHoverProvider` to call CSS hover logic
   - Modify `EligianCodeActionProvider` to call CSS code action logic
   - **Pros**: Single provider per type, simpler registration
   - **Cons**: Couples CSS logic to main providers

2. **Option B: Separate CSS Providers** (Recommended)
   - Create `CSSCompletionProvider`, `CSSHoverProvider`, `CSSCodeActionProvider`
   - Chain providers: main provider calls CSS provider if context is CSS
   - **Pros**: Separation of concerns, easier testing
   - **Cons**: Slightly more complex registration (need to chain calls)

**Recommended Pattern** (Option B):
```typescript
export class EligianCompletionProvider implements CompletionProvider {
  private cssCompletion: CSSCompletionProvider;

  constructor(services: EligianServices) {
    this.cssCompletion = new CSSCompletionProvider(services);
  }

  provideCompletion(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor) {
    // Try CSS completion first
    this.cssCompletion.provideCompletion(context, acceptor);

    // Continue with regular completions (operations, variables, etc.)
    return next(context, acceptor);
  }
}
```

---

## Error Handling

### Completion Errors

**Scenario**: CSS registry throws error during completion

**Handling**:
- Catch error in provider
- Log to language server console
- Return empty completion list (don't block other completions)
- User sees no CSS suggestions but other completions work

```typescript
provideCSSCompletion(context: CompletionContext, acceptor: CompletionAcceptor) {
  try {
    const classes = this.cssRegistry.getAllClasses(context.document.uri);
    // Generate completion items...
  } catch (error) {
    console.error('CSS completion failed:', error);
    // Return silently - don't break other completions
  }
}
```

### Hover Errors

**Scenario**: CSS registry throws error during hover lookup

**Handling**:
- Catch error in provider
- Log to language server console
- Return `undefined` (no hover content)
- User sees no tooltip (graceful degradation)

```typescript
provideCSSHover(node: AstNode, params: HoverParams): Hover | undefined {
  try {
    const classInfo = this.cssRegistry.getClassInfo(className, documentUri);
    if (!classInfo) return undefined;
    // Generate hover content...
  } catch (error) {
    console.error('CSS hover failed:', error);
    return undefined;
  }
}
```

### Code Action Errors

**Scenario**: Workspace edit fails to apply (CSS file read-only, permissions, etc.)

**Handling**:
- Error handled by VSCode client (shows error notification)
- Language server doesn't need to handle edit application errors
- If file reading fails during action generation, return empty actions array

```typescript
provideCreateClassAction(diagnostic: Diagnostic, cssFiles: string[]): CodeAction | undefined {
  try {
    const cssFilePath = cssFiles[0];
    const edit = this.createCSSClassEdit(cssFilePath, className);
    return {
      title: `Create '.${className}' in ${cssFilePath}`,
      kind: CodeActionKind.QuickFix,
      edit
    };
  } catch (error) {
    console.error('Failed to create code action:', error);
    return undefined;  // Action won't appear in menu
  }
}
```

---

## Performance Considerations

### Completion Performance

- **Target**: <100ms from request to response
- **Registry Queries**: O(1) for registry lookup, O(n) for iterating classes
- **Item Generation**: ~0.01ms per completion item
- **Max Items**: VSCode handles 1000+ items efficiently (fuzzy filtering)

**Bottlenecks to Avoid**:
- Reading CSS files on every completion (use cached registry)
- Synchronous file I/O (registry already cached)
- Complex string manipulation (keep insertText generation simple)

### Hover Performance

- **Target**: <50ms from request to response
- **Registry Queries**: O(1) for class lookup
- **Markdown Generation**: ~0.1ms per hover

**Bottlenecks to Avoid**:
- Reading CSS files on every hover (use cached registry)
- Complex markdown generation (template string is sufficient)

### Code Action Performance

- **Target**: <100ms from request to response
- **Registry Queries**: O(1) for checking if class exists
- **Edit Generation**: ~1ms per WorkspaceEdit

**Bottlenecks to Avoid**:
- Reading large CSS files to determine insertion point (use end-of-file)
- Complex CSS parsing during action generation (not needed)

---

## Testing with LSP Inspector

To test LSP protocol compliance, use the LSP Inspector in VSCode:

1. **Enable LSP Inspector**:
   - Open VSCode
   - Press `Ctrl+Shift+P` (Cmd+Shift+P on Mac)
   - Run: "Developer: Inspect Language Server"

2. **Inspect Requests/Responses**:
   - Trigger completion, hover, or code action
   - Inspector shows JSON request/response
   - Verify response matches LSP spec

3. **Debug Protocol Issues**:
   - Check if completion items have correct `kind`
   - Verify hover markdown renders correctly
   - Confirm code actions have `WorkspaceEdit` with valid URIs

---

## Summary

This feature uses **standard LSP protocols only**:
- `textDocument/completion` for autocomplete
- `textDocument/hover` for tooltips
- `textDocument/codeAction` for quick fixes

**No custom protocols required** - all functionality fits within standard LSP. This ensures compatibility with all LSP clients (VS Code, Neovim, Emacs, etc.) and simplifies implementation.

**Key Takeaway**: By leveraging Langium's LSP integration and standard protocols, Feature 014 requires **zero** custom protocol definitions. Everything works through standard LSP requests that Langium already handles.
