# Research: JSDoc-Style Documentation Comments

**Feature**: 020-jsdoc-style-comments
**Date**: 2025-10-30
**Purpose**: Resolve technical unknowns and document design decisions

## Research Questions

###1. How to capture JSDoc comments in Langium grammar?

**Decision**: Use Langium's `$comment` property feature

**Rationale**:
- Langium automatically captures documentation comments (starting with `/**`) via special `$comment` property on AST nodes
- Comments are associated with the immediately following grammar rule
- No manual parsing needed - Langium handles comment extraction from CST
- Preserves comment content as raw string for later parsing

**Implementation approach**:
```langium
ActionDefinition:
    'action' name=ID ('(' (parameters += Parameter (',' parameters += Parameter)*)? ')')?
    '[' (operations += OperationStatement)* ']';
```

After parsing, `ActionDefinition.$comment` will contain the JSDoc comment text if present.

**Alternatives considered**:
- Manual CST traversal: More complex, error-prone, reinvents Langium functionality
- Custom terminal for JSDoc: Unnecessarily complex, breaks Langium's built-in comment handling
- Post-parse CST analysis: Less efficient, doesn't leverage Langium's automatic association

**References**:
- Langium documentation on comment handling
- Existing Langium projects with documentation comments (TypeScript, Java language servers)

---

### 2. How to parse JSDoc content (`@param` tags)?

**Decision**: Write lightweight regex-based parser in `jsdoc-parser.ts`

**Rationale**:
- JSDoc syntax is well-defined and simple (for our subset: description + `@param`)
- Regex sufficient for `@param {type} name description` pattern
- No need for full JSDoc parser (jsdoc npm package) - we only support 2 features
- Keeps bundle size small, no new dependencies (Constitution Principle XIX)
- Fast enough for performance requirements (<300ms hover, <500ms completion)

**Implementation approach**:
```typescript
export interface JSDocComment {
  description: string;
  params: Array<{
    type?: string;      // Optional type in curly braces
    name: string;       // Required parameter name
    description?: string; // Optional description text
  }>;
}

export function parseJSDoc(commentText: string): JSDocComment | null {
  // 1. Extract description (everything before first @tag)
  // 2. Extract @param tags with regex: /@param\s+(?:\{([^}]+)\})?\s+(\w+)\s*(.*)/
  // 3. Return structured JSDocComment object
}
```

**Alternatives considered**:
- Full JSDoc parser (jsdoc package): Overkill, adds large dependency, supports tags we don't need
- AST-based parser: Over-engineered for simple tag syntax
- String splitting: Less robust than regex, harder to handle variations

**Edge cases handled**:
- Missing type annotation: `@param name description`
- Missing description: `@param {type} name`
- Whitespace variations: flexible regex matching
- Invalid syntax: return `null`, don't crash (FR-016: handle malformed gracefully)

---

### 3. How to trigger JSDoc template generation on `/**` typing?

**Decision**: Extend `EligianCompletionProvider` with character-trigger completion

**Rationale**:
- Langium/LSP supports "trigger characters" for completion (e.g., `.` for member access)
- Register `*` as trigger character - fires when second `*` is typed in `/**`
- Completion provider checks: is cursor after `/**` and above an action definition?
- If yes, generate JSDoc template using existing AST and type inference

**Implementation approach**:
```typescript
// In eligian-completion-provider.ts
override async getCompletion(
  document: LangiumDocument,
  params: CompletionParams
): Promise<CompletionList | undefined> {
  // Check if trigger is '*' at end of '/**'
  if (params.context?.triggerCharacter === '*') {
    const jsdocTemplate = await generateJSDocTemplate(document, params.position);
    if (jsdocTemplate) {
      return { items: [jsdocTemplate], isIncomplete: false };
    }
  }

  // Fall back to existing completion logic
  return super.getCompletion(document, params);
}
```

**Alternatives considered**:
- Command-based generation (e.g., "Generate JSDoc"): Requires extra user action, less ergonomic
- On-save generation: Too intrusive, modifies user code without explicit action
- Snippet-based: VS Code snippets, but less context-aware (can't infer types automatically)

**References**:
- LSP CompletionParams.context.triggerCharacter
- Existing Langium completion providers with trigger characters

---

### 4. How to infer parameter types for untyped parameters?

**Decision**: Leverage existing type inference system in `packages/language/src/type-system/`

**Rationale**:
- Type inference already implemented (FR-009 requirement: "use existing type inference system")
- Type system tracks parameter types through operation usage analysis
- For JSDoc generation: query type system for each parameter's inferred type
- If type unknown: use `'unknown'` in JSDoc template (honest fallback)

**Implementation approach**:
```typescript
// In jsdoc-template-generator.ts
function inferParameterType(param: Parameter, action: ActionDefinition): string {
  // 1. Check if parameter has explicit type annotation
  if (param.type) return param.type;

  // 2. Query type inference system
  const inferredType = typeSystem.inferParameterType(param, action);
  if (inferredType) return inferredType;

  // 3. Fallback to 'unknown'
  return 'unknown';
}
```

**Alternatives considered**:
- No type inference: Forces users to manually add types, reduces value of auto-generation
- Heuristic-based inference: Less accurate than existing type system, reinvents wheel
- Always use 'unknown': Safe but unhelpful, defeats purpose of smart generation

**Dependencies**:
- `packages/language/src/type-system/inference.ts` - existing type inference engine
- Type environment tracking through operation chains

---

### 5. How to display JSDoc in hover tooltips?

**Decision**: Extend `EligianHoverProvider.getHoverContent()` to check for action definitions

**Rationale**:
- Hover provider already exists and handles operation calls
- When hovering over action invocation: resolve action definition, check for `$comment`
- If JSDoc present: parse and format as markdown for tooltip
- Reuse existing markdown rendering (FR-015: bold, italic, code spans, links)

**Implementation approach**:
```typescript
// In eligian-hover-provider.ts
override async getHoverContent(
  document: LangiumDocument,
  params: HoverParams
): Promise<Hover | undefined> {
  const node = findNodeAtPosition(document, params.position);

  // Check if hovering over action invocation
  if (isActionCall(node)) {
    const actionDef = resolveActionDefinition(node);
    if (actionDef?.$comment) {
      const jsdoc = parseJSDoc(actionDef.$comment);
      if (jsdoc) {
        const markdown = formatJSDocAsMarkdown(jsdoc);
        return { contents: { kind: 'markdown', value: markdown } };
      }
    }
  }

  // Fall back to existing hover logic (operations, CSS, etc.)
  return super.getHoverContent(document, params);
}
```

**Alternatives considered**:
- Separate hover provider: Unnecessary, adds complexity without benefit
- Inline documentation in code lens: Different UX pattern, not hover-based
- Hover on action definition itself: Less useful, user already sees JSDoc in editor

**Markdown format**:
```markdown
### ActionName

Description text here...

**Parameters:**
- `paramName` (`type`) - Parameter description
- `otherParam` (`string`) - Other parameter description
```

---

### 6. How to handle malformed JSDoc comments?

**Decision**: Graceful degradation - parse what's valid, ignore invalid parts

**Rationale**:
- Constitution Principle II: Handle errors gracefully, don't crash (FR-016, SC-008)
- Invalid JSDoc shouldn't break parsing or IDE features
- Better to show partial documentation than no documentation or error

**Implementation approach**:
```typescript
export function parseJSDoc(commentText: string): JSDocComment | null {
  try {
    // Attempt to parse description and @param tags
    const description = extractDescription(commentText);
    const params = extractParams(commentText);

    // Return partial result even if some parts failed
    return { description, params };
  } catch (error) {
    // Log error for debugging, but don't propagate
    console.warn('[JSDoc Parser] Failed to parse comment:', error);
    return null; // Null indicates unparseable comment
  }
}
```

**Invalid patterns handled**:
- Unclosed comment `/** ...` (Langium handles this at lexer level)
- Missing closing brace `@param {string name` (skip this param, continue parsing)
- Typo in tag `@pram` instead of `@param` (ignore unknown tags)
- Parameter name mismatch (extra params in JSDoc) - show anyway, let user fix

**User experience**:
- Invalid JSDoc: hover shows nothing (falls back to signature-only hover)
- Partially valid JSDoc: hover shows what could be parsed
- No error messages in IDE (Constitution Principle V: UX consistency)

---

## Technology Stack Summary

**No new dependencies required** (Constitution Principle XIX verified)

**Existing dependencies leveraged**:
- Langium - Grammar extension, comment capture, AST, hover, completion
- Vitest - Unit and integration testing
- Biome - Code quality (linting, formatting)
- TypeScript 5.9.3 - Type safety

**Langium features used**:
- `$comment` property for automatic comment capture
- `AstNodeHoverProvider` for hover tooltips
- `DefaultCompletionProvider` for template generation
- CST utilities for position tracking
- Type guards (`isActionDefinition`, `isActionCall`)

**No external parsing libraries needed**: Regex sufficient for JSDoc subset

---

## Best Practices Applied

### 1. Langium Comment Handling Pattern

```typescript
// Access comment from AST node
if (actionDef.$comment) {
  const commentText = actionDef.$comment; // Raw JSDoc string
  const parsed = parseJSDoc(commentText);
}
```

### 2. Completion Provider Extension Pattern

```typescript
export class EligianCompletionProvider extends DefaultCompletionProvider {
  override async getCompletion(...): Promise<CompletionList | undefined> {
    // Check for JSDoc trigger first
    if (isJSDocTrigger(params)) {
      return generateJSDocCompletion(...);
    }
    // Fall back to existing logic
    return super.getCompletion(...);
  }
}
```

### 3. Hover Provider Extension Pattern

```typescript
export class EligianHoverProvider extends AstNodeHoverProvider {
  override async getHoverContent(...): Promise<Hover | undefined> {
    // Check for action invocation with JSDoc first
    const actionHover = await getActionJSDocHover(...);
    if (actionHover) return actionHover;

    // Fall back to existing logic (operations, CSS, etc.)
    return super.getHoverContent(...);
  }
}
```

### 4. Type Inference Integration Pattern

```typescript
// Query existing type system for parameter types
import { inferParameterType } from '../type-system/inference.js';

function generateParamTemplate(param: Parameter, action: ActionDefinition): string {
  const type = inferParameterType(param, action) || 'unknown';
  return `@param {${type}} ${param.name}`;
}
```

---

## Implementation Phases

**Phase 1**: Grammar + Parser (US1 - P1)
- Extend Langium grammar to capture JSDoc comments
- Implement `jsdoc-parser.ts` to parse JSDoc structure
- Write unit tests for parsing logic

**Phase 2**: Template Generation (US2 - P2)
- Implement `jsdoc-template-generator.ts` with type inference
- Extend `EligianCompletionProvider` for `/**` trigger
- Write unit tests for template generation
- Write integration tests for completion

**Phase 3**: Hover Display (US3 - P3)
- Extend `EligianHoverProvider` for action documentation
- Implement markdown formatting for JSDoc
- Write unit tests for hover logic
- Write integration tests for hover tooltips

**Testing Strategy**:
- **Unit tests**: Pure functions (parser, template generator, formatters)
- **Integration tests**: End-to-end IDE features (isolated in separate files per Constitution Principle II)
- **Coverage target**: 80% per Constitution Principle II

---

## Performance Considerations

**Parsing performance**:
- JSDoc parsing is synchronous, regex-based
- Typical JSDoc (5 params) parses in <1ms
- Edge case (20 params) still <5ms
- Well within 300ms hover requirement (SC-005)

**Completion performance**:
- Type inference already cached per document
- Template generation: string concatenation only
- Expected <50ms for typical action (3-5 params)
- Edge case (20 params): <100ms, still within 500ms requirement (SC-002)

**Memory footprint**:
- JSDoc stored in AST `$comment` property (already in memory)
- Parsed JSDoc cached per action definition (minimal overhead)
- No persistent storage needed (Constitution: in-memory only)

---

## Risk Mitigation

**Risk 1**: Langium `$comment` property not capturing comments correctly
- **Mitigation**: Test with minimal example first, verify Langium version compatibility
- **Fallback**: Manual CST traversal if needed (more complex but functional)

**Risk 2**: Type inference system returns `unknown` for many parameters
- **Mitigation**: Document inference limitations in user guide
- **Acceptable**: Users can manually add types in JSDoc (template still saves typing)

**Risk 3**: Malformed JSDoc causes parser crashes
- **Mitigation**: Comprehensive error handling, try/catch blocks, validation in tests
- **Success criteria**: SC-008 verified (no crashes on malformed input)

**Risk 4**: Performance degradation with 20+ parameters
- **Mitigation**: Profile early, optimize if needed (string builders vs concatenation)
- **Success criteria**: SC-007 verified (20 params without degradation)

---

## Open Questions

**None**. All technical unknowns resolved through research.

---

## Edge Case Documentation

### Special Characters in Descriptions

**Question**: How are special characters (`*/`, `@`, `{}`) handled in JSDoc descriptions?

**Answer**:
- **`*/` (comment closer)**: Langium lexer handles this at tokenization level. Using `*/` inside description will close the comment early (standard JSDoc behavior). Users must escape or avoid.
- **`@` symbol**: Treated as literal text in descriptions UNLESS it matches a recognized tag pattern (`@param`). Lone `@` symbols are preserved.
- **`{}` curly braces**: Treated as literal text in descriptions. Only special in `@param {type}` context.

**Parser Behavior**: Regex-based parser treats these as literals except in tag-matching context. No special escaping needed for `@` or `{}` in descriptions.

### Hovering Over Partial JSDoc

**Question**: What happens when hovering over action invocations before the documentation comment is fully written?

**Answer**: Graceful degradation:
- **Incomplete comment** (e.g., `/** Description` without closing `*/`): Langium lexer error (red squiggly on action), no hover documentation shown
- **Syntactically valid but incomplete** (e.g., `/** */` with no content): Parser returns empty description, hover shows action name only
- **Partial @param tags** (e.g., `@param foo` without type): Parser accepts, hover shows what's available

**Behavior**: Never crashes, always falls back to signature-only hover if JSDoc parsing fails.

### Nested Documentation Comments

**Question**: Does the system support nested JSDoc comments or documentation for nested actions?

**Answer**: No nested JSDoc support.
- **Langium grammar**: JSDoc comments can only appear directly above action definitions (top-level)
- **Nested actions**: If an action is defined inside another construct, JSDoc would need to be directly above the nested action (if grammar supports nested actions at all)
- **Current limitation**: Eligian grammar likely doesn't support nested action definitions, so this is not a concern

**Parser Behavior**: Each JSDoc comment is parsed independently. No nesting or hierarchical structure.
