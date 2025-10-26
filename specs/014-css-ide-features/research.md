# Research: Langium LSP Provider APIs

**Date**: 2025-10-26
**Purpose**: Research Langium APIs for implementing completion, hover, and code actions for CSS IDE features

## Research Topic 1: Langium Completion API Patterns

### Question 1: How to detect cursor position in string literals for selector completion?

**Decision**: Use Langium's `CompletionContext` which provides `textAtOffset` and `node` to determine cursor position within AST nodes. For string literals, inspect the `node` type and use `offset` relative to node start.

**Rationale**:
- Langium's `CompletionAcceptor` receives `CompletionContext` with cursor position
- The `textAtOffset` property gives the text segment around the cursor
- String literal nodes have offset information via `$cstNode` property
- Can calculate relative position within string by: `cursorOffset - node.$cstNode.offset`

**Implementation Pattern**:
```typescript
export class CSSCompletionProvider {
  provideCompletion(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor) {
    const node = context.node;
    if (ast.isStringLiteral(node)) {
      const cursorOffset = context.offset;
      const nodeStart = node.$cstNode?.offset || 0;
      const relativeOffset = cursorOffset - nodeStart;
      const textBeforeCursor = node.value.substring(0, relativeOffset);

      // Check if we're after a '.' or '#' for selector completion
      if (textBeforeCursor.endsWith('.')) {
        // Provide class completions
      } else if (textBeforeCursor.endsWith('#')) {
        // Provide ID completions
      }
    }
    return next(context, acceptor);
  }
}
```

**Alternatives Considered**:
- Regex matching on full document text: Rejected - less accurate, doesn't respect AST structure
- Custom lexer tokens for selectors: Rejected - over-engineering, breaks standard string literals

### Question 2: How to rank CSS completions higher than other suggestions?

**Decision**: Use `sortText` property on `CompletionItem` with prefixes like `"0_classname"` to rank CSS items first. VSCode's completion widget sorts alphabetically by `sortText`.

**Rationale**:
- Langium's `CompletionItem` has optional `sortText` property
- VSCode LSP sorts completion items by `sortText` (or `label` if `sortText` absent)
- Prefix with `"0_"` for CSS items ensures they sort before default items (which have no sort text)
- Can use numeric prefixes for fine-grained ranking: `"0_"` for classes, `"1_"` for IDs, `"2_"` for operations

**Implementation Pattern**:
```typescript
const completionItem: CompletionItem = {
  label: 'button',
  kind: CompletionItemKind.Property,
  detail: 'CSS class',
  sortText: '0_button', // Ranks before operations/variables
  insertText: 'button',
  documentation: {
    kind: MarkupKind.Markdown,
    value: 'Defined in styles.css:15'
  }
};
acceptor(context, completionItem);
```

**Alternatives Considered**:
- Custom `filterText`: Rejected - used for filtering, not ranking
- Modifying existing operation completions: Rejected - too invasive, breaks separation of concerns
- Using `preselect` property: Rejected - only one item can be preselected, not suitable for multiple CSS items

### Question 3: What's the completion item format for property vs method suggestions?

**Decision**: Use `CompletionItemKind.Property` for CSS classes/IDs (they're selector values, not functions). Use `insertText` for plain string insertion (no parentheses).

**Rationale**:
- CSS class names are values/properties, not invocable functions
- `CompletionItemKind.Property` shows appropriate icon in VSCode (box icon)
- `CompletionItemKind.Method` would be misleading (shows method icon with parentheses)
- Operations use `CompletionItemKind.Function` - this visual distinction helps users
- `insertText` is the literal text to insert (no snippets needed for simple class names)

**Implementation Pattern**:
```typescript
// CSS class completion
{
  label: 'button',
  kind: CompletionItemKind.Property, // Shows property icon
  insertText: 'button', // Plain string insertion
  detail: 'CSS class'
}

// vs Operation completion (for comparison)
{
  label: 'addClass',
  kind: CompletionItemKind.Function, // Shows function icon
  insertText: 'addClass($0)', // Snippet with placeholder
  insertTextFormat: InsertTextFormat.Snippet,
  detail: 'Operation'
}
```

**Alternatives Considered**:
- `CompletionItemKind.EnumMember`: Rejected - classes aren't enum members
- `CompletionItemKind.Constant`: Rejected - semantically incorrect
- `CompletionItemKind.Field`: Similar to Property, but Property is more general

---

## Research Topic 2: Langium Hover API Integration

### Question 1: How to detect hover over specific parts of string literals?

**Decision**: Implement `HoverProvider` and check if `params.position` falls within a string literal AST node. Use `$cstNode` offset/length to determine if hover is on a class name portion.

**Rationale**:
- Langium's `AstNodeHoverProvider` interface provides `getHoverContent(document, params)`
- `params` includes `position` (line, character)
- Can use `findLeafNodeAtOffset` to get CST node at hover position
- String literals contain class names - parse the string to find class boundaries

**Implementation Pattern**:
```typescript
export class CSSHoverProvider extends AstNodeHoverProvider {
  protected getAstNodeHoverContent(node: AstNode, params: HoverParams): Hover | undefined {
    if (ast.isOperationCall(node) && node.operationName === 'addClass') {
      const arg = node.arguments[0];
      if (ast.isStringLiteral(arg)) {
        const className = arg.value.replace(/['"]/g, '');
        const cssData = this.cssRegistry.getClassInfo(className);

        if (cssData) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `**CSS Class**: \`${className}\`\n\n` +
                     `Defined in: ${cssData.filePath}:${cssData.line}\n\n` +
                     `\`\`\`css\n${cssData.cssRule}\n\`\`\``
            }
          };
        }
      }
    }
    return undefined;
  }
}
```

**Alternatives Considered**:
- Parsing selector strings for each hover: Rejected - too expensive, cache parsing results
- Showing all classes in compound selector: Rejected - too noisy, show only hovered class

### Question 2: What's the markdown format for showing file locations and CSS previews?

**Decision**: Use `MarkupContent` with `kind: MarkupKind.Markdown` and format with headers, code fences, and links.

**Rationale**:
- LSP `Hover.contents` accepts `MarkupContent` with markdown support
- Code fences (`\`\`\`css\n...\n\`\`\``) provide syntax highlighting in hover
- Bold headers (`**CSS Class**:`) provide visual structure
- File links can be markdown links (though VSCode may not make them clickable in hover)

**Format Template**:
```markdown
**CSS Class**: `button`

Defined in: styles.css:15

​```css
.button {
  background: blue;
  color: white;
}
​```
```

**Alternatives Considered**:
- Plain text hover: Rejected - no syntax highlighting, less readable
- HTML in hover: Rejected - LSP doesn't support HTML in hover
- Multiple markdown sections: Rejected - single markdown string is simpler

### Question 3: How to handle hover on compound selectors (e.g., ".button.primary")?

**Decision**: Parse the selector string to identify class boundaries, determine which class is under cursor based on position, show hover only for that specific class.

**Rationale**:
- Compound selectors like `.button.primary` have multiple classes
- Cursor position determines which class is relevant
- Parsing with `selector-parser.ts` (from Feature 013) provides class positions
- Show hover for single class to avoid confusion

**Implementation Pattern**:
```typescript
// In CSSHoverProvider
const selectorText = arg.value;
const parsed = parseSelectorString(selectorText); // From Feature 013
const cursorOffset = params.position.character - arg.$cstNode.offset;

// Find which class is under cursor
const hoveredClass = parsed.classes.find(c =>
  cursorOffset >= c.start && cursorOffset <= c.end
);

if (hoveredClass) {
  const cssData = this.cssRegistry.getClassInfo(hoveredClass.name);
  // Return hover for this specific class only
}
```

**Alternatives Considered**:
- Show all classes in selector: Rejected - too much information, overwhelming
- Show combined rule for all classes: Rejected - may not exist as single rule in CSS

---

## Research Topic 3: Langium Code Actions API

### Question 1: How to create quick fix actions from validation diagnostics?

**Decision**: Implement `CodeActionProvider` and filter diagnostics by `code` property. Return `CodeAction` with `kind: CodeActionKind.QuickFix` and `diagnostics` array.

**Rationale**:
- Langium's `CodeActionProvider` interface: `getCodeActions(document, params)`
- `params.context.diagnostics` contains validation errors for the range
- Filter diagnostics with specific codes (e.g., `'css-unknown-class'`)
- Each `CodeAction` has `kind` (QuickFix, Refactor, etc.) and optional `diagnostics` array
- LSP client shows quick fixes in lightbulb menu

**Implementation Pattern**:
```typescript
export class CSSCodeActionProvider implements CodeActionProvider {
  getCodeActions(document: LangiumDocument, params: CodeActionParams): CodeAction[] {
    const actions: CodeAction[] = [];
    const cssErrors = params.context.diagnostics.filter(d =>
      d.code === 'css-unknown-class'
    );

    for (const diagnostic of cssErrors) {
      const className = extractClassNameFromDiagnostic(diagnostic);
      const cssFiles = this.cssRegistry.getImportedFiles(document.uri);

      if (cssFiles.length > 0) {
        actions.push({
          title: `Create '.${className}' in ${cssFiles[0]}`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: this.createCSSClassEdit(cssFiles[0], className)
        });
      }
    }

    return actions;
  }
}
```

**Alternatives Considered**:
- Command-based code actions: Rejected - `WorkspaceEdit` is simpler for file modifications
- Showing code actions for all diagnostics: Rejected - only relevant for CSS errors

### Question 2: How to construct LSP WorkspaceEdit for modifying CSS files?

**Decision**: Use `WorkspaceEdit` with `changes` property mapping file URIs to `TextEdit` arrays. Calculate insertion position at end of CSS file.

**Rationale**:
- LSP `WorkspaceEdit.changes` maps URI strings to `TextEdit[]`
- Each `TextEdit` specifies `range` (Position start/end) and `newText`
- For appending to end of file, use range with line = file.lineCount, character = 0
- LSP protocol handles file URIs (file:// scheme) natively

**Implementation Pattern**:
```typescript
private createCSSClassEdit(cssFilePath: string, className: string): WorkspaceEdit {
  const fileUri = URI.file(cssFilePath).toString();
  const fileContent = fs.readFileSync(cssFilePath, 'utf-8');
  const lines = fileContent.split('\n');
  const lastLine = lines.length;

  const newText = `\n.${className} {\n  /* TODO: Add styles */\n}\n`;

  return {
    changes: {
      [fileUri]: [{
        range: {
          start: { line: lastLine, character: 0 },
          end: { line: lastLine, character: 0 }
        },
        newText
      }]
    }
  };
}
```

**Alternatives Considered**:
- `documentChanges` with `TextDocumentEdit`: Rejected - `changes` is simpler for single-file edits
- Inserting at specific location in CSS: Rejected - end of file is safest, doesn't break existing rules
- Using AST-based CSS insertion: Rejected - overkill, text-based append is sufficient

### Question 3: How to determine cursor position in file for inserting new CSS rules?

**Decision**: Always append new CSS rules at the end of the file (last line, character 0) to avoid breaking existing CSS structure.

**Rationale**:
- Inserting in middle of file risks breaking existing rules (missing closing braces, etc.)
- End-of-file insertion is safest - never corrupts existing CSS
- Simple to implement - just use file.lineCount as line number
- Users can manually move the rule if they want it elsewhere
- Matches common IDE behavior for "create missing" quick fixes

**Alternatives Considered**:
- Smart insertion near related classes: Rejected - complex heuristics, error-prone
- Asking user where to insert: Rejected - slows down workflow, defeats "quick" fix purpose
- Inserting at top of file: Rejected - may break @import rules or CSS variables

---

## Research Topic 4: Performance Best Practices

### Question 1: Should completion items be cached or generated on-demand?

**Decision**: Generate on-demand for each completion request, but query CSSRegistry (which is already cached from Feature 013).

**Rationale**:
- CSSRegistry already caches parsed CSS data (Feature 013)
- Generating `CompletionItem` objects is fast (<1ms for 1000 classes)
- On-demand generation ensures fresh data after CSS file changes
- Caching completion items would require invalidation logic (complexity)
- Feature 013's CSS hot-reload ensures registry is always up-to-date

**Implementation Pattern**:
```typescript
provideCompletion(context: CompletionContext, acceptor: CompletionAcceptor) {
  const cssData = this.cssRegistry.getAllClasses(); // Cached in registry

  // Generate completion items on-demand (fast)
  for (const className of cssData.classes) {
    acceptor(context, {
      label: className,
      kind: CompletionItemKind.Property,
      sortText: `0_${className}`,
      detail: 'CSS class'
    });
  }
}
```

**Alternatives Considered**:
- Pre-computing completion items: Rejected - invalidation complexity, premature optimization
- Lazy loading completion items: Rejected - not needed, generation is already fast

### Question 2: How to avoid blocking the LSP server with large CSS files?

**Decision**: CSS parsing happens in Feature 013's file watcher (separate from LSP requests). Providers only **query** the registry synchronously (fast, in-memory lookups).

**Rationale**:
- Feature 013 already handles CSS parsing asynchronously in file watchers
- Registry queries are in-memory Map lookups (O(1) or O(n) for iteration)
- Providers never parse CSS - they only read from registry
- Even with 1000+ classes, iterating to generate completions takes <10ms
- LSP protocol expects synchronous provider responses - async would complicate protocol

**Performance Benchmarks** (estimated):
- Registry query for 1000 classes: <1ms
- Generate 1000 completion items: <10ms
- Hover lookup for single class: <0.1ms
- Total completion latency target: <100ms (includes network, protocol overhead)

**Alternatives Considered**:
- Async providers with Promises: Rejected - Langium providers are synchronous by design
- Pagination/lazy loading of completions: Rejected - VSCode handles large completion lists efficiently
- Indexing/search data structures: Rejected - premature optimization, Map is sufficient

---

## Summary

### Key Decisions

1. **Completion**: Use `CompletionContext` offset calculations, `sortText` for ranking, `CompletionItemKind.Property` for CSS classes
2. **Hover**: Implement `AstNodeHoverProvider`, use markdown with code fences, parse selectors to determine hovered class
3. **Code Actions**: Filter diagnostics by code, return `WorkspaceEdit` with text edits, append new CSS rules at end of file
4. **Performance**: Generate items on-demand, rely on Feature 013's cached CSS registry, synchronous provider responses

### Technology Stack Confirmed

- **Langium 3.x**: LSP provider interfaces (`CompletionAcceptor`, `HoverProvider`, `CodeActionProvider`)
- **Feature 013 CSSRegistry**: Cached CSS metadata (classes, IDs, locations, rules)
- **VSCode LSP Protocol**: Standard `CompletionItem`, `Hover`, `CodeAction`, `WorkspaceEdit` types
- **No new dependencies**: All patterns use existing Langium and LSP types

### Integration Points

1. **CSSRegistry** (from Feature 013): Single source of truth for CSS metadata
2. **Eligian Services Module**: Register providers in `createEligianServices()` or module configuration
3. **Existing Providers**: Integrate CSS logic into existing `EligianCompletionProvider` or create separate providers
4. **Validation**: Code actions depend on validation errors from Feature 013's CSS validators

### Next Steps

Proceed to Phase 1 design to create:
- `data-model.md`: Provider interfaces, data structures
- `quickstart.md`: User guide for CSS IDE features
- `contracts/`: LSP protocol documentation (or justification if not needed)
- Update agent context with Langium LSP technologies
