# Hover Provider Feature

The Eligian VS Code extension provides rich hover tooltips for operations, showing their descriptions, parameters, dependencies, and outputs directly from the operation registry.

## How It Works

When you hover over an operation name (like `selectElement`, `animate`, `addClass`), the hover provider:

1. Identifies that you're hovering over an `OperationCall` AST node
2. Looks up the operation signature in the operation registry
3. Formats a markdown tooltip with:
   - Operation name
   - Description
   - Parameter list (with types and required/optional status)
   - Dependencies (what this operation requires from previous operations)
   - Outputs (what this operation provides for subsequent operations)

## Example Hover Tooltip

When hovering over `selectElement`:

```markdown
### selectElement

Selects a DOM element using a CSS selector.

**Parameters:**
- `selector`: `ParameterType:selector` *(required)*

**Provides:**
- `selectedElement` (`ParameterType:jQuery`)
```

When hovering over `addClass`:

```markdown
### addClass

Adds one or more CSS classes to the selected element.

**Parameters:**
- `className`: `ParameterType:className` *(required)*

**Requires:**
- `selectedElement` (`ParameterType:jQuery`)
```

## Implementation Details

### File: `packages/language/src/eligian-hover-provider.ts`

The `EligianHoverProvider` class extends Langium's `AstNodeHoverProvider` and overrides `getHoverContent` to intercept hovers at the CST (Concrete Syntax Tree) level:

```typescript
export class EligianHoverProvider extends AstNodeHoverProvider {
  override async getHoverContent(
    document: LangiumDocument,
    params: HoverParams
  ): Promise<Hover | undefined> {
    const rootNode = document.parseResult?.value?.$cstNode;
    if (!rootNode) return undefined;

    const offset = document.textDocument.offsetAt(params.position);
    const cstNode = CstUtils.findLeafNodeAtOffset(rootNode, offset);

    // Check if we're hovering over an operation call
    if (cstNode?.astNode && isOperationCall(cstNode.astNode)) {
      const signature = getOperationSignature(cstNode.astNode.operationName);
      if (signature) {
        const markdown = this.buildOperationHoverMarkdown(signature);
        return { contents: { kind: 'markdown', value: markdown } };
      }
    }

    // Fall back to default behavior (multiline comments, etc.)
    return super.getHoverContent(document, params);
  }
}
```

**Why override `getHoverContent` instead of `getAstNodeHoverContent`?**

Langium's default `getHoverContent` uses `findDeclarationNodeAtOffset` which only finds *declarations*, not usage sites. When you hover over `selectElement(...)`, the operation name is just an identifier token, not a declaration. By overriding `getHoverContent`, we can use `findLeafNodeAtOffset` to detect any CST node and check if its associated AST node is an `OperationCall`.

### Registration

The hover provider is registered in `packages/language/src/eligian-module.ts`:

```typescript
export const EligianModule: Module<...> = {
  validation: {
    EligianValidator: () => new EligianValidator(),
  },
  lsp: {
    HoverProvider: (services) => new EligianHoverProvider(services),
  },
};
```

## Testing

To test the hover provider in the VS Code Extension Development Host:

1. Build the extension:
   ```bash
   npm run build
   ```

2. Open the extension in VS Code and press **F5** to start Extension Development Host

3. Open a `.eligian` file (e.g., `examples/comprehensive-features.eligian`)

4. Hover over any operation call (e.g., `selectElement`, `animate`, `addClass`)

5. You should see a rich markdown tooltip with:
   - Operation description
   - Parameter information
   - Dependency requirements
   - Output information

## Benefits

1. **Inline Documentation**: No need to look up operation documentation separately
2. **Type Information**: See parameter types and requirements immediately
3. **Dependency Discovery**: Understand what operations need to come before/after
4. **IDE Ergonomics**: Standard VS Code hover experience with markdown formatting

## Future Enhancements

Potential improvements:

- Add code examples to hover tooltips
- Show related operations (alternatives or commonly used together)
- Link to full Eligius documentation
- Show parameter default values
- Add hover support for action references
- Add hover support for variable references
