# Research: Missing Label Entry Quick Fix

**Feature**: 041-label-entry-quickfix
**Date**: 2025-11-29

## Research Tasks

### 1. Existing Code Action Infrastructure

**Question**: How are code actions currently implemented in the Eligian language server?

**Finding**: The codebase has a well-established pattern for code actions:

1. **Main Provider**: `EligianCodeActionProvider` in `packages/language/src/eligian-code-action-provider.ts`
   - Implements Langium's `CodeActionProvider` interface
   - Delegates to specialized providers (CSS, language block, labels file)
   - Uses `getCodeActions()` method that receives document, params, and cancellation token

2. **Pattern for Diagnostics-Based Quick Fixes** (from Feature 039):
   - Filter diagnostics by error code (e.g., `MISSING_LABELS_FILE_CODE`)
   - Extract data from diagnostic's `data` field
   - Create `CodeAction` with `CodeActionKind.QuickFix`
   - Return command that triggers extension-side handler

3. **Extension Command Registration** (from `packages/extension/src/extension/main.ts`):
   - Commands registered with `vscode.commands.registerCommand()`
   - Commands receive arguments from code action's `command.arguments`

**Decision**: Follow the exact same pattern as Feature 039's `createLabelsFileActions()` method, but for `unknown_label_id` diagnostics.

**Rationale**: Maintaining consistency with existing code action patterns ensures predictable behavior and easier maintenance.

---

### 2. Label Validation Diagnostic Data

**Question**: What data is available in the `unknown_label_id` diagnostic?

**Finding**: The label ID validation in `eligian-validator.ts` creates diagnostics with:

```typescript
accept('error', `${error.message}. ${error.hint}`, {
  node: labelIdArg,  // The AST node (StringLiteral)
  data: { code: error.code }  // error.code = 'unknown_label_id'
});
```

Current data includes:
- `code`: 'unknown_label_id' or 'no_labels_import'
- AST node reference (for range calculation)

**Gap Identified**: The current diagnostic data does NOT include:
- The actual label ID value
- The labels file URI
- The language codes from the languages block

**Decision**: Extend the diagnostic data to include additional fields needed for the quick fix:
1. `labelId`: The missing label ID string
2. `labelsFileUri`: URI of the labels file to modify
3. `languageCodes`: Array of language codes from languages block

**Rationale**: The code action handler needs this information to generate the label entry without re-parsing the document.

---

### 3. Labels File Modification Strategy

**Question**: How should the labels file be modified atomically?

**Finding**: The labels file is a JSON array of label groups:

```json
[
  {
    "id": "existing-label",
    "labels": [
      { "id": "uuid-1", "languageCode": "en-US", "label": "Hello" }
    ]
  }
]
```

**Strategy Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Read JSON, parse, append, stringify | Clean, handles formatting | May change formatting/order |
| B | Read file, find `]`, insert before | Preserves exact formatting | Fragile if JSON has trailing whitespace |
| C | Use JSON streaming parser | Memory efficient for large files | Overkill for typical size |

**Decision**: Use Option A (parse, modify, stringify with 2-space indent) with atomic write:
1. Read existing labels file content
2. Parse as JSON array
3. Append new label entry
4. Stringify with 2-space indentation
5. Write atomically (write to temp file, rename)

**Rationale**: Option A is simplest and most robust. The slight formatting change is acceptable since the schema doesn't mandate specific formatting.

---

### 4. Language Code Extraction from AST

**Question**: How to extract language codes from the languages block AST?

**Finding**: The `Program` AST node has an optional `languages` property (type `LanguagesBlock`):

```typescript
// From generated/ast.ts
interface Program {
  languages?: LanguagesBlock;
  statements: Statement[];
  // ...
}

interface LanguagesBlock {
  entries: LanguageEntry[];
}

interface LanguageEntry {
  code: string;      // e.g., "en-US"
  label: string;     // e.g., "English"
  isDefault: boolean;
}
```

**Decision**: Extract language codes directly from the AST in the code action provider:

```typescript
function extractLanguageCodes(program: Program): string[] {
  if (!program.languages?.entries) {
    return ['en-US']; // Default fallback per spec
  }
  return program.languages.entries.map(entry => entry.code);
}
```

**Rationale**: Direct AST access is reliable and already available in the code action context.

---

### 5. UUID Generation

**Question**: How to generate UUIDs for translation entry IDs?

**Finding**: Node.js has built-in `crypto.randomUUID()` since v14.17.0 (stable in v15.6.0+). The project targets modern Node.js.

**Decision**: Use `crypto.randomUUID()` for UUID v4 generation.

**Rationale**: No external dependencies needed, built-in, and produces valid UUID v4 format.

---

### 6. Labels Registry Integration

**Question**: Should the quick fix update the labels registry after modifying the file?

**Finding**: The labels registry (`LabelRegistryService`) tracks label IDs per document for validation. After the quick fix modifies the labels file:
1. The file watcher (`LabelsWatcherManager`) should detect the change
2. The registry will be updated automatically via existing hot-reload mechanism

**Decision**: Do NOT manually update the registry in the quick fix. Rely on the existing hot-reload mechanism.

**Rationale**:
- Avoids code duplication with hot-reload logic
- Ensures consistency between file content and registry
- The hot-reload mechanism is already battle-tested

---

### 7. Error Handling Strategy

**Question**: What errors can occur and how should they be handled?

**Finding**: Potential error scenarios:

| Error | Cause | Handling |
|-------|-------|----------|
| File read failure | Permissions, file locked | Show error message, abort |
| Invalid JSON | Corrupted labels file | Do NOT offer quick fix (per spec) |
| File write failure | Permissions, disk full | Show error message with details |
| No labels import | Document state changed | Quick fix should not appear |

**Decision**:
1. Validate labels file is valid JSON before offering quick fix
2. Use try-catch with specific error types for file operations
3. Show VS Code error notifications for failures

**Rationale**: Matches the error handling pattern established in Feature 039.

---

## Summary of Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Code Action Pattern | Follow Feature 039 pattern | Consistency, maintainability |
| Diagnostic Data | Extend with labelId, labelsFileUri, languageCodes | Required for quick fix execution |
| File Modification | Parse JSON, append, stringify, atomic write | Simple, robust |
| Language Extraction | Direct AST access from Program.languages | Reliable, available in context |
| UUID Generation | `crypto.randomUUID()` | Built-in, no dependencies |
| Registry Update | Rely on hot-reload mechanism | Avoid duplication, battle-tested |
| Error Handling | Validate JSON first, specific error messages | User-friendly, consistent |

## Dependencies Confirmed

- Feature 033: Labels import infrastructure ✅
- Feature 034: Label ID validation (provides diagnostics) ✅
- Feature 037: Languages block parsing ✅
- Feature 039: Labels file creation quick fix (pattern to follow) ✅
- Labels registry hot-reload mechanism ✅
