# Research: Language Block Quick Fix

**Feature**: Language Block Quick Fix
**Date**: 2025-11-24
**Status**: Complete

## Overview

This document consolidates research findings for implementing the language block quick fix feature. The research focuses on understanding existing patterns, technical approaches, and best practices for implementing LSP code actions in the Eligian DSL project.

## Research Questions & Findings

### Q1: What is the exact structure of labels JSON files?

**Finding**: Labels files follow a well-defined JSON schema with nested structure.

**Schema Structure**:
```json
[
  {
    "id": "label-group-id",
    "labels": [
      {
        "id": "individual-label-id",
        "languageCode": "en-US",
        "label": "Actual label text"
      },
      {
        "id": "individual-label-id-2",
        "languageCode": "nl-NL",
        "label": "Dutch label text"
      }
    ]
  }
]
```

**Key Observations**:
- Root is an array of label groups
- Each group has an `id` and `labels` array
- Each label within a group has:
  - `id`: Unique identifier for the label
  - `languageCode`: Standard locale format (e.g., "en-US", "nl-NL", "fr-FR")
  - `label`: The actual text for that language
- Language codes can vary between label groups (one group might have en-US/nl-NL, another might have en-US/fr-FR/de-DE)

**Source**: `examples/demo-labels.json`, `packages/language/src/schemas/labels-schema.json`

**Decision**: Language extraction algorithm will:
1. Parse JSON as array
2. Iterate through each label group
3. Iterate through each label in the group
4. Extract `languageCode` field
5. Deduplicate using a Set
6. Sort alphabetically for consistent ordering

---

### Q2: How does Langium's CodeActionProvider API work?

**Finding**: Langium provides a clean `CodeActionProvider` interface that integrates with LSP's code action protocol.

**API Pattern** (from `eligian-code-action-provider.ts`):

```typescript
export class EligianCodeActionProvider implements CodeActionProvider {
  async getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams
  ): Promise<Array<Command | CodeAction>> {
    const actions: CodeAction[] = [];
    // Generate code actions based on diagnostics or context
    return actions;
  }
}
```

**CodeActionParams Structure**:
```typescript
interface CodeActionParams {
  textDocument: TextDocumentIdentifier;
  range: Range;                    // Selected or cursor range
  context: CodeActionContext;       // Contains diagnostics
}

interface CodeActionContext {
  diagnostics: Diagnostic[];        // Errors/warnings at this location
  only?: CodeActionKind[];          // Filter for specific action types
}
```

**CodeAction Structure**:
```typescript
interface CodeAction {
  title: string;                    // Shown in quick fix menu
  kind?: CodeActionKind;            // 'quickfix', 'refactor', etc.
  diagnostics?: Diagnostic[];       // Diagnostics this action fixes
  edit?: WorkspaceEdit;             // Text changes to apply
  command?: Command;                // Alternative to edit
}
```

**WorkspaceEdit Pattern** (from `css-code-actions.ts`):
```typescript
const edit: WorkspaceEdit = {
  changes: {
    [documentUri]: [
      {
        range: {
          start: { line: insertLine, character: 0 },
          end: { line: insertLine, character: 0 }
        },
        newText: generatedText
      }
    ]
  }
};
```

**Source**: `packages/language/src/eligian-code-action-provider.ts`, `packages/language/src/css/css-code-actions.ts`

**Decision**: Follow existing CSS code action pattern:
- Create `LanguageBlockCodeActionProvider` class
- Detect context (missing language block + labels import present)
- Generate workspace edit with formatted language block text
- Return code action with "Generate language block" title

---

### Q3: What is the algorithm for determining insertion position?

**Finding**: Insertion position must be determined by AST analysis and Langium document structure.

**Requirements from Spec**:
- Insert at top of file (FR-006)
- Insert after file-level comments (US3)
- Insert before imports or other content (US3)

**Langium Document Structure**:
```typescript
interface LangiumDocument {
  parseResult: ParseResult;
  uri: URI;
  textDocument: TextDocument;
}

interface ParseResult {
  value: Program;              // Root AST node
  parserErrors: ParseError[];
  lexerErrors: LexerError[];
}

interface Program {
  $type: 'Program';
  languages?: LanguagesBlock;  // If present, skip quick fix
  imports: Import[];
  // ... other properties
}
```

**Position Determination Algorithm**:

1. **Check for existing LanguagesBlock**:
   - If `program.languages` exists → skip quick fix (no action needed)

2. **Find insertion point**:
   - Case A: File has no content → insert at line 0
   - Case B: File has comments at top → insert after last comment
   - Case C: File has imports → insert before first import
   - Case D: File has timeline/actions → insert before first declaration

3. **Get line position from AST node**:
   ```typescript
   const node = program.imports[0] || program.timelines[0] || ...;
   const position = node.$cstNode?.range.start;
   const insertLine = position?.line || 0;
   ```

4. **Handle whitespace**:
   - Add blank line after language block for readability
   - Generated text: `languages {\n  * "lang" "label"\n}\n\n`

**Source**: Langium documentation, existing AST traversal patterns in validators

**Decision**: Implement `FilePositionHelper.findInsertionPosition()` that:
- Returns `{ line: number, character: number }` for insertion point
- Handles all positioning cases (empty file, comments, imports, etc.)
- Ensures proper whitespace separation

---

### Q4: How should we handle edge cases (multiple imports, missing files)?

**Finding**: Graceful degradation with template generation is the best UX.

**Edge Case Analysis**:

1. **Multiple labels imports**:
   - Decision: Extract languages from ALL imported labels files
   - Combine into single deduplicated set
   - User may have split labels across files (e.g., `common-labels.json`, `feature-labels.json`)

2. **Missing labels file**:
   - Decision: Generate template with `en-US` default
   - Rationale: Better UX than showing error (per spec assumption)
   - Template: `languages {\n  * "en-US" "en-US label"\n}\n\n`

3. **Invalid JSON**:
   - Decision: Same as missing file (generate template)
   - Log warning for debugging but don't show error to user
   - Rationale: Developer can still work, fix labels file later

4. **Labels file with no language codes** (empty or malformed):
   - Decision: Generate template with `en-US` default
   - Rationale: Edge case, template enables progress

5. **Relative vs absolute paths**:
   - Labels imports use relative paths: `labels "./path/to/labels.json"`
   - Resolution: Resolve relative to document URI
   - Pattern from CSS code actions: convert URI to file path, read with fs

6. **Language code validation**:
   - Decision: Include all languageCode values as-is (no validation)
   - Rationale: JSON schema validates label files, quick fix should not duplicate validation
   - If malformed, compiler/validator will catch it later

**Error Handling Pattern**:
```typescript
async function extractLanguageCodes(
  labelsFilePath: string,
  readFile: (path: string) => Promise<string>
): Promise<string[]> {
  try {
    const content = await readFile(labelsFilePath);
    const data = JSON.parse(content);
    // Extract language codes...
    return languageCodes;
  } catch (error) {
    // Log for debugging, but return empty array
    console.error(`Failed to parse labels file: ${labelsFilePath}`, error);
    return []; // Caller will use template
  }
}
```

**Source**: Feature 013 (CSS code actions) error handling patterns

**Decision**: Implement defensive parsing with fallback to template generation on any error.

---

## Technology Decisions

### Language & Framework
- **TypeScript 5.x**: Project standard
- **Langium**: Language server framework (already in use)
- **VS Code LSP**: Code action protocol (standard)

### JSON Parsing
- **Built-in JSON.parse()**: Sufficient for labels files
- **Error handling**: try/catch with fallback to template

### File I/O
- **Pattern from CSS code actions**: Use injected `readFile` function
- **Async/await**: Handle file operations asynchronously
- **Path resolution**: Use document URI as base for relative paths

### Testing
- **Vitest**: Unit and integration tests
- **Langium test utilities**: `parseHelper`, `validationHelper`
- **Test helpers**: Use `createTestContext()` from `test-helpers.ts`

---

## Best Practices from Existing Code

### From Feature 013 (CSS Code Actions)

1. **Delegate pattern**: Main `EligianCodeActionProvider` delegates to feature-specific providers
2. **Async file reading**: Use injected `readFile` function for testability
3. **URI handling**: Convert URIs to paths, handle encoding/decoding
4. **Workspace edits**: Use LSP `WorkspaceEdit` with `changes` map
5. **Error resilience**: Catch errors, log for debugging, don't fail the quick fix

### From Langium Test Patterns

1. **createTestContext() in beforeAll()**: Initialize services once per suite
2. **Fixtures in __tests__/fixtures/**: Co-locate test data with tests
3. **DiagnosticSeverity enum**: Use constants, not magic numbers
4. **Snapshot testing**: Not needed for code actions (behavior tests sufficient)

---

## Architecture Decisions

### Module Structure

**Directory**: `packages/language/src/labels/`

**Files**:
- `language-block-code-actions.ts` - Main provider class
- `labels-parser.ts` - JSON parsing + language extraction
- `language-block-generator.ts` - Format generation logic
- `file-position-helper.ts` - AST analysis for insertion position
- `index.ts` - Public exports

**Rationale**: Mirrors CSS code actions structure, clear separation of concerns

### Integration Point

**File**: `packages/language/src/eligian-code-action-provider.ts`

**Change**:
```typescript
import { LanguageBlockCodeActionProvider } from './labels/language-block-code-actions.js';

export class EligianCodeActionProvider implements CodeActionProvider {
  private readonly cssCodeActionProvider: CSSCodeActionProvider;
  private readonly languageBlockProvider: LanguageBlockCodeActionProvider; // NEW

  constructor(private readonly services: EligianServices) {
    this.cssCodeActionProvider = new CSSCodeActionProvider();
    this.languageBlockProvider = new LanguageBlockCodeActionProvider(); // NEW
  }

  async getCodeActions(document, params) {
    const actions: CodeAction[] = [];

    // Existing CSS actions
    const cssActions = await this.cssCodeActionProvider.provideCodeActions(...);
    actions.push(...cssActions);

    // NEW: Language block actions
    const langActions = await this.languageBlockProvider.provideCodeActions(
      params,
      document,
      this.readFile
    );
    actions.push(...langActions);

    return actions;
  }
}
```

---

## Performance Considerations

### File Reading
- **Async I/O**: Don't block language server
- **Caching**: Not needed (code actions called on-demand, not frequently)
- **Large files**: JSON.parse handles up to 50 languages easily (<1ms parse time)

### AST Traversal
- **Single pass**: Find insertion position in one traversal
- **Early exit**: If LanguagesBlock exists, skip immediately

### Workspace Edits
- **Single edit**: One workspace edit per code action (atomic)
- **Small text**: Language block generation is <1KB typically

**Estimated Performance**:
- File read: <50ms
- JSON parse: <5ms
- Language extraction: <1ms
- Text generation: <1ms
- Total: <100ms (well under 5-second requirement)

---

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|-------------------|
| Labels JSON schema changes | Defensive parsing with fallbacks |
| File I/O failures | Try/catch, fallback to template |
| AST structure changes | Integration tests will catch breakage |
| Performance with large files | Performance tests in test suite |

---

## References

- Langium Documentation: https://langium.org/docs/
- VS Code LSP Specification: https://microsoft.github.io/language-server-protocol/
- Existing implementation: `packages/language/src/css/css-code-actions.ts`
- Labels schema: `packages/language/src/schemas/labels-schema.json`
- Example labels: `examples/demo-labels.json`

---

## Conclusion

All research questions answered. Ready to proceed to Phase 1 (Design & Contracts).

**Key Takeaways**:
1. Labels JSON structure is well-defined and parseable
2. Code action infrastructure exists and is well-tested
3. Insertion position can be determined via AST analysis
4. Error handling should favor graceful degradation over failures
5. Performance requirements are easily achievable with async I/O

**No technical blockers identified.**
