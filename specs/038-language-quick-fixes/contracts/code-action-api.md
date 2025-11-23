# API Contract: Language Block Quick Fix

**Feature**: Language Block Quick Fix
**Date**: 2025-11-24
**Status**: Complete

## Overview

This document defines the public API contracts for the language block quick fix module. All functions, classes, and interfaces documented here represent the public API that can be consumed by other parts of the system.

---

## Module Exports

**Module Path**: `packages/language/src/labels/`

**Public Exports**:
```typescript
export { LanguageBlockCodeActionProvider } from './language-block-code-actions.js';
export { LabelsParser } from './labels-parser.js';
export { LanguageBlockGenerator } from './language-block-generator.js';
export { FilePositionHelper } from './file-position-helper.js';

// Types
export type {
  LanguageCodeInfo,
  LanguageBlockQuickFixContext,
  InsertionPosition,
  LanguageBlockGenerationResult,
} from './types.js';
```

---

## Class: LanguageBlockCodeActionProvider

Main entry point for language block quick fixes.

### Constructor

```typescript
constructor()
```

**Description**: Creates a new instance of the language block code action provider.

**Parameters**: None

**Example**:
```typescript
const provider = new LanguageBlockCodeActionProvider();
```

---

### Method: provideCodeActions

```typescript
async provideCodeActions(
  params: CodeActionParams,
  document: LangiumDocument,
  readFile: (uri: string) => Promise<string>
): Promise<CodeAction[]>
```

**Description**: Provides code actions for generating a language block when labels are imported but no language block exists.

**Parameters**:
- `params` (CodeActionParams): LSP code action parameters with context and range
- `document` (LangiumDocument): The Langium document being edited
- `readFile` ((uri: string) => Promise<string>): Function to read file contents asynchronously

**Returns**: `Promise<CodeAction[]>`
- Array of code actions (typically 0 or 1 action)
- Empty array if language block already exists or no labels imports found
- Single action if language block missing and labels imports present

**Behavior**:
1. Checks if document has labels imports
2. Checks if language block already exists
3. If missing, parses labels files to extract language codes
4. Generates code action with workspace edit to insert language block
5. Returns code action with title "Generate language block from labels"

**Error Handling**:
- File read errors → falls back to template generation
- JSON parse errors → falls back to template generation
- No errors thrown (graceful degradation)

**Performance**:
- Expected: <100ms for typical labels files (<50 languages)
- Maximum: 1 second (per SC-006 requirement)

**Example**:
```typescript
const actions = await provider.provideCodeActions(
  params,
  document,
  async (uri) => await fs.readFile(uri, 'utf-8')
);

// Result:
// [
//   {
//     title: 'Generate language block from labels',
//     kind: CodeActionKind.QuickFix,
//     edit: { changes: { ... } }
//   }
// ]
```

---

## Class: LabelsParser

Parses labels JSON files and extracts language codes.

### Static Method: extractLanguageCodes

```typescript
static async extractLanguageCodes(
  labelsFilePaths: string[],
  readFile: (uri: string) => Promise<string>
): Promise<LanguageCodeInfo[]>
```

**Description**: Extracts unique language codes from one or more labels JSON files.

**Parameters**:
- `labelsFilePaths` (string[]): Array of file paths to labels JSON files (relative or absolute)
- `readFile` ((uri: string) => Promise<string>): Async function to read file contents

**Returns**: `Promise<LanguageCodeInfo[]>`
- Array of language code info objects
- Sorted alphabetically by code
- First language marked as default (isDefault: true)
- Empty array if all files fail to parse

**Algorithm**:
1. For each labels file path:
   - Read file contents using readFile
   - Parse JSON
   - Extract languageCode from each label in each label group
   - Add to Set for deduplication
2. Convert Set to sorted array
3. Mark first element as default
4. Return array of LanguageCodeInfo objects

**Error Handling**:
- File not found → skip file, log error, continue
- Invalid JSON → skip file, log error, continue
- Missing languageCode field → skip entry, continue
- All files failed → return empty array (caller generates template)

**Performance**:
- Expected: <50ms for typical labels files
- Async I/O (non-blocking)

**Example**:
```typescript
const codes = await LabelsParser.extractLanguageCodes(
  ['./labels/common.json', './labels/feature.json'],
  async (path) => await fs.readFile(path, 'utf-8')
);

// Result:
// [
//   { code: 'de-DE', isDefault: false },
//   { code: 'en-US', isDefault: true },  // First alphabetically
//   { code: 'fr-FR', isDefault: false },
//   { code: 'nl-NL', isDefault: false },
// ]
```

**Invariants**:
- ALWAYS returns sorted array (alphabetical by code)
- EXACTLY one element has isDefault: true (unless empty array)
- NO duplicate language codes in result

---

## Class: LanguageBlockGenerator

Generates formatted language block text.

### Static Method: generate

```typescript
static generate(
  languageCodes: LanguageCodeInfo[]
): LanguageBlockGenerationResult
```

**Description**: Generates a formatted language block from language code information.

**Parameters**:
- `languageCodes` (LanguageCodeInfo[]): Array of language codes to include in block

**Returns**: `LanguageBlockGenerationResult`
- `text`: Formatted language block text with braces, newlines, and indentation
- `languageCount`: Number of languages in the block
- `isTemplate`: True if generated from empty array (template mode)

**Formatting Rules**:
1. Opening: `languages {\n`
2. For each language:
   - Default language: `  * "code" "code label"\n`
   - Other languages: `  "code" "code label"\n`
3. Closing: `}\n\n`

**Template Mode**:
- If languageCodes is empty array → generate template with "en-US"
- isTemplate flag set to true

**Example (Normal)**:
```typescript
const result = LanguageBlockGenerator.generate([
  { code: 'en-US', isDefault: true },
  { code: 'nl-NL', isDefault: false },
]);

// Result:
// {
//   text: 'languages {\n  * "en-US" "en-US label"\n  "nl-NL" "nl-NL label"\n}\n\n',
//   languageCount: 2,
//   isTemplate: false
// }
```

**Example (Template)**:
```typescript
const result = LanguageBlockGenerator.generate([]);

// Result:
// {
//   text: 'languages {\n  * "en-US" "en-US label"\n}\n\n',
//   languageCount: 1,
//   isTemplate: true
// }
```

**Performance**:
- Expected: <1ms for typical cases (<50 languages)
- Synchronous (no I/O)

**Invariants**:
- Generated text is ALWAYS valid Langium LanguagesBlock syntax
- Generated text ALWAYS ends with double newline
- languageCount ALWAYS matches number of entries

---

## Class: FilePositionHelper

Determines insertion position for language block in document.

### Static Method: findInsertionPosition

```typescript
static findInsertionPosition(
  document: LangiumDocument
): InsertionPosition
```

**Description**: Finds the appropriate position to insert a language block in the document.

**Parameters**:
- `document` (LangiumDocument): The document being edited

**Returns**: `InsertionPosition`
- `line`: Zero-based line number for insertion
- `character`: Zero-based character offset (typically 0)

**Algorithm**:
1. Get root Program AST node
2. If Program has LanguagesBlock → return { line: 0, character: 0 } (shouldn't happen, caller should check first)
3. Find first non-comment child node:
   - Imports
   - Timelines
   - Actions
   - etc.
4. If found, return position before that node
5. If no children, return { line: 0, character: 0 }

**Positioning Rules** (Priority Order):
1. Before first import statement
2. Before first timeline declaration
3. Before first action definition
4. Start of file (if empty)

**Example (Before Import)**:
```eligian
// File content:
// This is a comment
labels "./labels.json"

timeline "Demo" at 0s {
  ...
}
```

```typescript
const position = FilePositionHelper.findInsertionPosition(document);

// Result: { line: 2, character: 0 }
// (Before the labels import on line 2)
```

**Example (Empty File)**:
```typescript
const position = FilePositionHelper.findInsertionPosition(emptyDocument);

// Result: { line: 0, character: 0 }
```

**Performance**:
- Expected: <1ms (single AST traversal)
- Synchronous (no I/O)

**Invariants**:
- ALWAYS returns valid position (line >= 0, character >= 0)
- Position is ALWAYS at start of line (character: 0)

---

## Type Contracts

### LanguageCodeInfo

```typescript
interface LanguageCodeInfo {
  code: string;              // Non-empty language code
  isDefault: boolean;        // True if default language
  sourceGroupId?: string;    // Optional: where code was found
}
```

**Contract**:
- `code` is NEVER empty string
- In an array, EXACTLY one element has `isDefault: true`
- `sourceGroupId` is optional metadata (not used in generation)

---

### LanguageBlockQuickFixContext

```typescript
interface LanguageBlockQuickFixContext {
  documentUri: string;
  labelsFilePaths: string[];
  insertionPosition: InsertionPosition;
  languageCodes: LanguageCodeInfo[];
  hasParseErrors: boolean;
}
```

**Contract**:
- `documentUri` is valid file:// URI
- `labelsFilePaths` may be empty if no labels imports
- `insertionPosition` is valid position in document
- `languageCodes` may be empty if parsing failed
- `hasParseErrors` is true if ANY labels file failed to parse

---

### InsertionPosition

```typescript
interface InsertionPosition {
  line: number;      // Zero-based line number (>= 0)
  character: number; // Zero-based character offset (>= 0)
}
```

**Contract**:
- `line >= 0` ALWAYS
- `character >= 0` ALWAYS
- Matches LSP Position structure

---

### LanguageBlockGenerationResult

```typescript
interface LanguageBlockGenerationResult {
  text: string;           // Valid LanguagesBlock syntax
  languageCount: number;  // Number of languages (>= 1)
  isTemplate: boolean;    // True if generated from empty input
}
```

**Contract**:
- `text` is ALWAYS valid Langium LanguagesBlock syntax
- `languageCount >= 1` ALWAYS (minimum 1 for template)
- `isTemplate` is true IFF input was empty array

---

## Integration Contract

### EligianCodeActionProvider Integration

The `EligianCodeActionProvider` integrates the language block provider as follows:

```typescript
class EligianCodeActionProvider implements CodeActionProvider {
  private readonly languageBlockProvider: LanguageBlockCodeActionProvider;

  async getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams
  ): Promise<Array<Command | CodeAction>> {
    const actions: CodeAction[] = [];

    // ... other providers (CSS, etc.) ...

    // Language block quick fixes
    const langBlockActions = await this.languageBlockProvider.provideCodeActions(
      params,
      document,
      this.readFile  // Injected file reader
    );
    actions.push(...langBlockActions);

    return actions;
  }

  private async readFile(uri: string): Promise<string> {
    // Implementation using Node.js fs or workspace file system
    const path = uriToPath(uri);
    return await fs.readFile(path, 'utf-8');
  }
}
```

**Contract**:
- Provider is instantiated once in constructor
- Provider is called on every code action request
- Provider may return empty array (no action available)
- Provider NEVER throws (errors handled internally)

---

## Error Handling Contract

### General Error Handling Policy

All public methods follow this error handling contract:

1. **File I/O Errors**:
   - Catch all file read errors
   - Log error message (for debugging)
   - Fall back to template generation
   - NEVER throw exception to caller

2. **JSON Parse Errors**:
   - Catch all JSON.parse errors
   - Log error message with file path
   - Fall back to template generation
   - NEVER throw exception to caller

3. **AST Errors**:
   - Defensive null checks for AST nodes
   - Fall back to safe defaults (line 0, character 0)
   - NEVER throw exception to caller

**Rationale**: Code actions should NEVER crash the language server. Graceful degradation is always preferred.

---

## Performance Contract

### Performance Guarantees

| Operation | Maximum Time | Typical Time |
|-----------|-------------|--------------|
| provideCodeActions() | 1000ms | 100ms |
| extractLanguageCodes() | 500ms | 50ms |
| generate() | 10ms | <1ms |
| findInsertionPosition() | 10ms | <1ms |

**Performance Testing**:
- Test with labels files containing 50 languages (SC-003)
- Test with multiple labels file imports
- Test with large files (>10,000 lines)

---

## Versioning

**Initial Version**: 1.0.0
**Stability**: Stable (no breaking changes planned)

**Semantic Versioning**:
- MAJOR: Breaking changes to public API
- MINOR: New features (backwards compatible)
- PATCH: Bug fixes, performance improvements

---

## Examples

### Complete Workflow Example

```typescript
// 1. User opens file with labels import but no language block
// 2. VS Code requests code actions via LSP

const document = /* LangiumDocument */;
const params = /* CodeActionParams */;

// 3. Provider generates code action
const provider = new LanguageBlockCodeActionProvider();
const actions = await provider.provideCodeActions(
  params,
  document,
  async (uri) => await fs.readFile(uriToPath(uri), 'utf-8')
);

// 4. User clicks code action in IDE
// 5. Workspace edit applied
// Result:
// languages {
//   * "de-DE" "de-DE label"
//   "en-US" "en-US label"
//   "fr-FR" "fr-FR label"
//   "nl-NL" "nl-NL label"
// }
//
// labels "./labels/common.json"
// ...
```

---

## Testing Contract

All public methods MUST have:
1. Unit tests for success cases
2. Unit tests for error cases
3. Integration tests for end-to-end workflows
4. Performance tests for SC-003 compliance

See `specs/TESTING_GUIDE.md` for testing patterns.

---

## Summary

**Public Classes**: 4 (LanguageBlockCodeActionProvider, LabelsParser, LanguageBlockGenerator, FilePositionHelper)

**Public Types**: 4 (LanguageCodeInfo, LanguageBlockQuickFixContext, InsertionPosition, LanguageBlockGenerationResult)

**Key Contracts**:
- No exceptions thrown (graceful degradation)
- Performance < 1 second (SC-006)
- Template generation on errors (FR-009, FR-010)
- Sorted, deduplicated language codes (SC-002)
