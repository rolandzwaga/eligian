# Langium Completion and Hover Provider Research

**Date**: 2025-01-18
**Context**: Feature 035 US3 - Controller autocomplete and hover failing (11/16 tests)
**Problem**: Custom completion for `addController()` parameters not working

## Research Sources

1. **Local Langium Repository**: `F:\projects\langium\packages\langium\src\lsp\`
2. **Context7 MCP**: Langium documentation and examples
3. **Web Search**: Langium tutorials and discussions (2024)

---

## Key Findings

### 1. How Langium Completion Works (DefaultCompletionProvider)

**File**: `F:\projects\langium\packages\langium\src\lsp\completion\completion-provider.ts`

#### Main Flow (`getCompletion` method, lines 153-189):

```typescript
async getCompletion(document: LangiumDocument, params: CompletionParams): Promise<CompletionList | undefined> {
    const items: CompletionItem[] = [];
    const contexts = this.buildContexts(document, params.position);  // Build completion contexts

    const acceptor: CompletionAcceptor = (context, value) => {
        const completionItem = this.fillCompletionItem(context, value);
        if (completionItem) {
            items.push(completionItem);
        }
    };

    for (const context of contexts) {
        await Promise.all(
            stream(context.features)
                .distinct(distinctionFunction)
                .exclude(completedFeatures)
                .map(e => this.completionFor(context, e, acceptor))  // Call completionFor for each feature
        );
        completedFeatures.push(...context.features);
        if (!this.continueCompletion(items)) {
            break;
        }
    }

    return CompletionList.create(this.deduplicateItems(items), true);
}
```

**Key Points**:
- Langium builds **multiple completion contexts** at different token positions
- For each context, it calls `completionFor(context, next, acceptor)` for each grammar feature
- `completionFor` is where custom providers can add completions
- The default implementation only handles **keywords** and **cross-references**

#### What `completionFor` handles (lines 406-415):

```typescript
protected completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): MaybePromise<void> {
    if (ast.isKeyword(next.feature)) {
        return this.completionForKeyword(context, next.feature, acceptor);
    } else if (ast.isCrossReference(next.feature) && context.node) {
        return this.completionForCrossReference(context, next as NextFeature<ast.CrossReference>, acceptor);
    }
    // Don't offer any completion for other elements (i.e. terminals, datatype rules)
}
```

**CRITICAL INSIGHT**: Langium's default `completionFor` does **NOT** provide completions for:
- **String literals** (terminals)
- **Data type rules**
- **Regular assignments** (non-cross-reference properties)

This is explicitly stated in the comment: _"We cannot reasonably assume their contents."_

---

### 2. How to Provide String Literal Completions

#### Problem with Our Current Approach

Our implementation checks `cursorContext.isInControllerName` in `completionFor()`, but **Langium is not calling `completionFor()` for string literal positions**.

When the cursor is inside `addController("N|")`:
- Langium detects this as a STRING terminal
- `completionFor()` is **NOT called** for STRING terminals (see line 414 comment)
- Our custom completion logic never runs

#### Solution Pattern from Langium Examples

From web search and Context7 documentation, the **correct approach** is:

1. **Override `getCompletion()`** directly (not just `completionFor()`)
2. **Detect string literal context** before calling `super.getCompletion()`
3. **Add completions via acceptor** and return early

**Example Pattern** (from langium-ui-framework):

```typescript
async getCompletion(document: LangiumDocument, params: CompletionParams): Promise<CompletionList | undefined> {
    // Detect if we're in a special context (like inside a string)
    const offset = document.textDocument.offsetAt(params.position);
    const specialContext = detectSpecialContext(document, offset);

    if (specialContext) {
        const items: CompletionItem[] = [];
        const acceptor = (context, value) => {
            const item = this.fillCompletionItem(context, value);
            if (item) items.push(item);
        };

        // Add custom completions
        for (const completion of getCustomCompletions(specialContext)) {
            acceptor(someContext, completion);
        }

        return CompletionList.create(items, true);
    }

    // Fallback to default
    return super.getCompletion(document, params);
}
```

---

### 3. How Langium Hover Works (AstNodeHoverProvider)

**File**: `F:\projects\langium\packages\langium\src\lsp\hover-provider.ts`

#### Main Flow (`getHoverContent` method, lines 46-77):

```typescript
async getHoverContent(document: LangiumDocument, params: HoverParams): Promise<Hover | undefined> {
    const rootNode = document.parseResult?.value?.$cstNode;
    if (rootNode) {
        const offset = document.textDocument.offsetAt(params.position);
        const cstNode = findDeclarationNodeAtOffset(rootNode, offset, this.grammarConfig.nameRegexp);  // Find CST node

        if (cstNode && cstNode.offset + cstNode.length > offset) {
            const contents: string[] = [];
            const targetNodes = this.references.findDeclarations(cstNode);  // Find declaration targets

            for (const targetNode of targetNodes) {
                const content = await this.getAstNodeHoverContent(targetNode);  // Get hover content
                if (typeof content === 'string') {
                    contents.push(content);
                }
            }

            if (contents.length > 0) {
                return { contents: { kind: 'markdown', value: contents.join(' ') } };
            }

            // Keyword hover support
            if (isKeyword(cstNode.grammarSource)) {
                return this.getKeywordHoverContent(cstNode.grammarSource);
            }
        }
    }
    return undefined;
}
```

**Key Points**:
- Langium uses `findDeclarationNodeAtOffset()` to find the CST node at cursor
- It uses `this.references.findDeclarations()` to find the **declaration** of what's being hovered
- For **string literals**, there's no declaration to find → hover returns `undefined`
- Custom hover providers must override `getAstNodeHoverContent()` or `getHoverContent()` directly

#### Our Hover Implementation Issue

Our `buildControllerHover()` method is only called when `opName === 'addController'`, but:
- We're checking this in `getHoverContent()` by looking at the parent operation call
- This logic appears to be working (1 test passes: "Hovering over controller name shows description")
- **But 7 tests are failing** → likely position detection issue

---

### 4. Context Detection Issues

#### The Offset vs Position Problem

Langium uses **two different coordinate systems**:

1. **Offset**: Byte offset from start of document (0-indexed integer)
2. **Position**: Line/character position (LSP protocol: `{ line: number, character: number }`)

**Critical**: Must convert between them using:
- `document.textDocument.positionAt(offset)` → offset to position
- `document.textDocument.offsetAt(position)` → position to offset

#### Our Context Detection (`detectControllerContext`)

**File**: `packages/language/src/completion/context.ts:343-398`

```typescript
function detectControllerContext(
  document: LangiumDocument,
  offset: number,
  cstNode: CstNode | undefined,
  operationCall: OperationCall
): { isInControllerName: boolean; controllerName?: string; parameterIndex?: number; }
```

**Potential Issues**:

1. **String detection relies on CST node text**: `nodeText.includes('"')`
   - If cursor is between empty quotes `addController("")`, there might not be a STRING CST node yet
   - Need to check if Langium creates a STRING node for empty strings

2. **Parameter index counting**: Uses regex `textInCall.match(/["']/g)`
   - Assumes well-formed strings (closed quotes)
   - Might fail if user types `addController("Nav` (unclosed quote)

3. **Not called for all contexts**: Only called if `operationCall` exists
   - If grammar doesn't recognize it as OperationCall yet, detection fails

---

## Root Cause Analysis

### Why Completion Tests Fail (11/16 failing)

**Hypothesis**: The completion provider is never called for string literal positions.

**Evidence**:
1. Langium's `completionFor()` explicitly skips terminals (line 414)
2. Our code adds completions in `completionFor()` → never runs for STRING positions
3. Tests expect completions inside `addController("N")` → STRING context

**Fix Required**:
- Override `getCompletion()` directly
- Detect controller context BEFORE calling `super.getCompletion()`
- Build completion contexts manually for STRING positions

### Why Hover Tests Fail (7/16 failing)

**Hypothesis 1**: Position calculation is incorrect (offset vs line/character mismatch)

**Evidence**:
1. One test passes ("Hovering over controller name shows description")
2. Other tests fail → suggests position detection works sometimes but not always
3. Tests use different position calculation methods

**Hypothesis 2**: String literal hover detection fails for certain positions

**Evidence**:
1. Hover provider uses `findDeclarationNodeAtOffset()` with `nameRegexp`
2. String literals might not match the name regexp pattern
3. Our custom logic might not be reached for all string positions

**Fix Required**:
- Debug exact CST nodes being found at test cursor positions
- Verify our hover logic is actually being called
- Check if position calculations match expected CST node offsets

---

## Action Items

### Immediate Fixes Needed

1. **Completion Provider**:
   - [ ] Move controller completion logic to `getCompletion()` override
   - [ ] Detect controller context before calling super
   - [ ] Build completion contexts manually for STRING literals
   - [ ] Test with empty strings: `addController("")`

2. **Hover Provider**:
   - [ ] Add debug logging to verify `buildControllerHover()` is called
   - [ ] Check CST node types at failing test positions
   - [ ] Verify offset calculations match expected nodes
   - [ ] Test position-to-offset conversion in tests

3. **Context Detection**:
   - [ ] Handle empty string case: `addController("")`
   - [ ] Handle unclosed quotes: `addController("Nav`
   - [ ] Test parameter index detection with partial strings

### Testing Strategy

1. **Unit test context detection**:
   - Test `detectControllerContext()` in isolation
   - Verify it detects all parameter positions correctly
   - Test edge cases (empty strings, partial strings, unclosed quotes)

2. **Integration test CST structure**:
   - Parse `addController("NavigationController")`
   - Inspect CST nodes at each character position
   - Verify STRING nodes exist and have expected offsets

3. **Debug test failures**:
   - Add console.log in provider methods
   - Run single failing test
   - Trace execution to find where logic breaks

---

## References

### Key Langium Files to Study

1. **Completion Provider**:
   - `F:\projects\langium\packages\langium\src\lsp\completion\completion-provider.ts`
   - Lines 153-189: `getCompletion()` main flow
   - Lines 229-318: `buildContexts()` - how Langium creates contexts
   - Lines 406-415: `completionFor()` - what it handles

2. **Hover Provider**:
   - `F:\projects\langium\packages\langium\src\lsp\hover-provider.ts`
   - Lines 46-77: `getHoverContent()` main flow
   - Line 50: `findDeclarationNodeAtOffset()` - how it finds nodes

3. **CST Utils**:
   - `F:\projects\langium\packages\langium\src\utils\cst-utils.ts`
   - `findDeclarationNodeAtOffset()` - finds nodes at position
   - `findLeafNodeAtOffset()` - finds leaf nodes
   - `findLeafNodeBeforeOffset()` - finds nodes before position

### Langium Documentation

1. **Configuration via Services**: https://langium.org/docs/reference/configuration-services/
2. **Cross-Reference Resolution**: https://langium.org/docs/learn/workflow/resolve_cross_references/
3. **Grammar Language Reference**: https://langium.org/docs/reference/grammar-language/

### Example Implementations

1. **langium-ui-framework**: `https://github.com/TypeFox/langium-ui-framework/blob/main/src/language-server/simple-ui-completion.ts`
   - Shows how to extend DefaultCompletionProvider
   - Provides CSS class completions (similar to our use case)

---

## Conclusion

The core issue is that **Langium's default completion provider does not call `completionFor()` for string literal (terminal) positions**. Our implementation assumes `completionFor()` will be called, but it never is for `addController("N|")` positions.

**Solution**: Override `getCompletion()` directly and detect controller context before delegating to super. This is the same pattern used by other Langium projects that provide string literal completions (e.g., CSS class completion in langium-ui-framework).

For hover, the issue is likely **position detection** - we need to verify our CST node finding logic works correctly for all test cases, especially for string literals which don't have "declarations" in the traditional sense.
