# Data Model: CSS IDE Features

**Date**: 2025-10-26
**Purpose**: Define data structures and interfaces for CSS completion, hover, and code actions

## Provider Interfaces

### CSSCompletionProvider

Generates completion items for CSS classes and IDs based on cursor context.

**Input**: `CompletionContext`
- `offset: number` - Cursor position in document
- `node: AstNode` - AST node at cursor (may be string literal, operation call, etc.)
- `textAtOffset: string` - Text segment around cursor
- `document: LangiumDocument` - Current document

**Output**: `void` (items added via `CompletionAcceptor`)

**Methods**:
```typescript
/**
 * Provide CSS class completions in className parameters (e.g., addClass(""))
 */
provideCSSClassCompletions(
  context: CompletionContext,
  acceptor: CompletionAcceptor
): void

/**
 * Provide selector completions when typing '.' or '#' in selector strings
 */
provideSelectorCompletions(
  context: CompletionContext,
  acceptor: CompletionAcceptor,
  selectorType: 'class' | 'id'
): void
```

**Completion Item Structure**:
```typescript
interface CompletionItem {
  label: string;                  // "button" (CSS class name)
  kind: CompletionItemKind;       // Property for classes/IDs
  detail?: string;                // "CSS class" or "CSS ID"
  sortText?: string;              // "0_button" (ranks before operations)
  insertText?: string;            // "button" (text to insert)
  documentation?: MarkupContent;  // Optional: file location
}
```

---

### CSSHoverProvider

Provides hover tooltips showing CSS file location and rule previews.

**Input**: `HoverParams`
- `position: Position` - Cursor position (line, character)
- `textDocument: TextDocumentIdentifier` - Document URI

**Output**: `Hover | undefined`

**Methods**:
```typescript
/**
 * Provide hover for CSS class names in addClass/removeClass operations
 */
provideCSSClassHover(
  node: AstNode,
  params: HoverParams
): Hover | undefined

/**
 * Provide hover for CSS IDs in selectElement operations
 */
provideCSSIDHover(
  node: AstNode,
  params: HoverParams
): Hover | undefined
```

**Hover Structure**:
```typescript
interface Hover {
  contents: MarkupContent;  // Markdown with file location + CSS preview
  range?: Range;            // Optional: highlight range for hover
}

interface MarkupContent {
  kind: MarkupKind.Markdown;
  value: string;  // e.g., "**CSS Class**: `button`\n\nDefined in: styles.css:15\n\n```css\n..."
}
```

**Hover Content Format** (Markdown template):
```markdown
**CSS Class**: `<className>`

Defined in: <filePath>:<lineNumber>

​```css
.<className> {
  <cssRules>
}
​```
```

---

### CSSCodeActionProvider

Generates quick fix actions to create missing CSS classes.

**Input**: `CodeActionParams`
- `range: Range` - Range of diagnostic/selection
- `context: CodeActionContext` - Diagnostics, trigger kind
  - `diagnostics: Diagnostic[]` - Validation errors in range

**Output**: `CodeAction[]`

**Methods**:
```typescript
/**
 * Create quick fix action to generate missing CSS class
 */
provideCreateClassAction(
  diagnostic: Diagnostic,
  cssFiles: string[]
): CodeAction | undefined

/**
 * Extract class name from diagnostic message
 */
private extractClassNameFromDiagnostic(
  diagnostic: Diagnostic
): string | undefined
```

**CodeAction Structure**:
```typescript
interface CodeAction {
  title: string;                   // "Create '.button' in styles.css"
  kind: CodeActionKind;            // QuickFix
  diagnostics?: Diagnostic[];      // Links to specific error
  edit?: WorkspaceEdit;            // Text edits to apply
  isPreferred?: boolean;           // Optional: mark as preferred fix
}

interface WorkspaceEdit {
  changes?: {
    [uri: string]: TextEdit[];    // file:///path/to/styles.css -> [edits]
  };
}

interface TextEdit {
  range: Range;                     // Insertion point
  newText: string;                  // CSS rule to insert
}
```

**CSS Rule Template** (inserted at end of file):
```css

.<className> {
  /* TODO: Add styles */
}
```

---

## CSS Metadata Structures (From Feature 013)

These structures are already defined in CSSRegistry from Feature 013. Providers **query** this data.

### CSSRegistryService Interface

```typescript
interface CSSRegistryService {
  /**
   * Get all CSS classes from imported files
   */
  getAllClasses(documentUri: string): Set<string>

  /**
   * Get all CSS IDs from imported files
   */
  getAllIDs(documentUri: string): Set<string>

  /**
   * Get metadata for specific CSS class
   */
  getClassInfo(className: string, documentUri: string): CSSClassInfo | undefined

  /**
   * Get metadata for specific CSS ID
   */
  getIDInfo(idName: string, documentUri: string): CSSIDInfo | undefined

  /**
   * Get list of CSS files imported by document
   */
  getImportedFiles(documentUri: string): string[]
}
```

### CSSClassInfo Structure

```typescript
interface CSSClassInfo {
  name: string;              // "button" (without dot)
  filePath: string;          // "styles.css" or "/absolute/path/to/styles.css"
  line: number;              // Line number where defined (1-indexed)
  column: number;            // Column number where defined (0-indexed)
  cssRule: string;           // Complete CSS rule text (e.g., ".button { ... }")
}
```

### CSSIDInfo Structure

```typescript
interface CSSIDInfo {
  name: string;              // "header" (without hash)
  filePath: string;          // "layout.css"
  line: number;              // Line number where defined
  column: number;            // Column number where defined
  cssRule: string;           // Complete CSS rule text (e.g., "#header { ... }")
}
```

---

## Completion Context Detection

### Context Types

1. **ClassName Parameter Context**
   - Triggered when cursor is inside string literal in `addClass()`, `removeClass()`, `toggleClass()` calls
   - Parent AST node: `OperationCall` with operation name matching class operations
   - Provides: All CSS classes from imported files

2. **Selector String Context**
   - Triggered when cursor is inside string literal in `selectElement()` calls
   - Detects `.` or `#` prefix before cursor
   - After `.`: Provides CSS classes
   - After `#`: Provides CSS IDs

### Context Detection Algorithm

```typescript
function detectCompletionContext(context: CompletionContext): CompletionContextType {
  const node = context.node;

  // Check if we're in a string literal
  if (!ast.isStringLiteral(node)) {
    return CompletionContextType.None;
  }

  // Get parent operation call
  const parent = node.$container;
  if (!ast.isOperationCall(parent)) {
    return CompletionContextType.None;
  }

  // Determine operation type
  const opName = parent.operationName;

  if (CLASS_OPERATIONS.includes(opName)) {
    // addClass, removeClass, toggleClass
    return CompletionContextType.ClassName;
  }

  if (opName === 'selectElement') {
    // Check for selector prefix
    const relativeOffset = context.offset - (node.$cstNode?.offset || 0);
    const textBeforeCursor = node.value.substring(0, relativeOffset);

    if (textBeforeCursor.endsWith('.')) {
      return CompletionContextType.SelectorClass;
    } else if (textBeforeCursor.endsWith('#')) {
      return CompletionContextType.SelectorID;
    }
  }

  return CompletionContextType.None;
}

enum CompletionContextType {
  None,
  ClassName,
  SelectorClass,
  SelectorID
}
```

---

## Hover Context Detection

### Hover Target Detection

```typescript
function detectHoverTarget(node: AstNode, params: HoverParams): HoverTarget | undefined {
  // Check if we're hovering over a string literal
  if (!ast.isStringLiteral(node)) {
    return undefined;
  }

  // Get parent operation call
  const parent = node.$container;
  if (!ast.isOperationCall(parent)) {
    return undefined;
  }

  const opName = parent.operationName;

  // For className operations, show class hover
  if (CLASS_OPERATIONS.includes(opName)) {
    const className = node.value.replace(/['"]/g, '');
    return {
      type: 'class',
      name: className
    };
  }

  // For selectElement, parse selector to find hovered class/ID
  if (opName === 'selectElement') {
    const selectorText = node.value;
    const parsed = parseSelectorString(selectorText); // From Feature 013
    const cursorOffset = calculateRelativeCursorOffset(params.position, node);

    // Find which class/ID is under cursor
    const hoveredClass = parsed.classes.find(c =>
      cursorOffset >= c.start && cursorOffset <= c.end
    );

    if (hoveredClass) {
      return {
        type: 'class',
        name: hoveredClass.name
      };
    }

    const hoveredID = parsed.ids.find(id =>
      cursorOffset >= id.start && cursorOffset <= id.end
    );

    if (hoveredID) {
      return {
        type: 'id',
        name: hoveredID.name
      };
    }
  }

  return undefined;
}

interface HoverTarget {
  type: 'class' | 'id';
  name: string;
}
```

---

## Code Action Context Detection

### Diagnostic Code Filtering

Code actions only trigger for specific validation error codes:

```typescript
const CSS_RELATED_CODES = [
  'css-unknown-class',      // Unknown CSS class in addClass/removeClass
  'css-unknown-id',         // Unknown CSS ID in selectElement
  'css-unknown-selector'    // Unknown selector in selectElement
];

function getCSSQuickFixes(params: CodeActionParams): CodeAction[] {
  const actions: CodeAction[] = [];

  // Filter diagnostics to CSS-related errors only
  const cssErrors = params.context.diagnostics.filter(d =>
    CSS_RELATED_CODES.includes(d.code as string)
  );

  for (const diagnostic of cssErrors) {
    const action = createQuickFixAction(diagnostic, params.textDocument.uri);
    if (action) {
      actions.push(action);
    }
  }

  return actions;
}
```

---

## Performance Considerations

### Caching Strategy

- **CSS Metadata**: Cached in CSSRegistry (Feature 013), invalidated on CSS file changes
- **Completion Items**: Generated on-demand (fast, <10ms for 1000 classes)
- **Hover Content**: Generated on-demand (fast, <1ms for single class lookup)
- **Code Actions**: Generated on-demand when quick fix menu opened

### Memory Usage

- **Registry**: ~1KB per 100 CSS classes (Map overhead + string data)
- **Completion Items**: Transient, GC'd after completion session
- **Hover Content**: Transient, GC'd after hover dismissed

### Latency Targets

- **Completion**: <100ms from trigger to suggestions shown (target: <50ms for provider logic)
- **Hover**: <50ms from hover to tooltip display (target: <10ms for provider logic)
- **Code Actions**: <100ms from lightbulb click to menu shown

---

## Integration with Existing Services

### Service Registration

Providers are registered in Langium services module:

```typescript
export const EligianModule: Module<EligianServices, PartialLangiumServices> = {
  lsp: {
    CompletionProvider: (services) => new EligianCompletionProvider(services),
    HoverProvider: (services) => new EligianHoverProvider(services),
    CodeActionProvider: (services) => new EligianCodeActionProvider(services)
  },
  // ... other services
};
```

### Service Dependencies

Each provider depends on:
- **CSSRegistryService**: From Feature 013, provides CSS metadata
- **LangiumDocument**: Current document being edited
- **AstNodeLocator**: For finding AST nodes at cursor position
- **NameProvider**: For getting qualified names of AST nodes (if needed)

---

## Summary

This data model defines three core providers (Completion, Hover, CodeActions) that query CSS metadata from Feature 013's CSSRegistry. All providers use standard Langium/LSP interfaces with no custom protocols needed. The design prioritizes simplicity (on-demand generation), performance (cached registry queries), and separation of concerns (providers don't parse CSS, only query registry).
