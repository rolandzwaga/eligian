# Data Model: Language Block Quick Fix

**Feature**: Language Block Quick Fix
**Date**: 2025-11-24
**Status**: Complete

## Overview

This document defines the data structures and types used in the language block quick fix implementation. All types are TypeScript interfaces and types that will be used across the labels quick fix module.

---

## Core Entities

### LanguageCodeInfo

Represents a language code extracted from a labels file with optional metadata.

```typescript
/**
 * Information about a language code extracted from labels file
 */
export interface LanguageCodeInfo {
  /**
   * The language code (e.g., "en-US", "nl-NL", "fr-FR")
   * Follows ISO 639-1 (language) + ISO 3166-1 (country) format
   */
  code: string;

  /**
   * Whether this language code should be marked as default (* prefix)
   * Typically the first language code alphabetically
   */
  isDefault: boolean;

  /**
   * Optional: Source label group ID where this code was first found
   * Useful for debugging and error messages
   */
  sourceGroupId?: string;
}
```

**Usage**:
- Returned by `LabelsParser.extractLanguageCodes()`
- Input to `LanguageBlockGenerator.generate()`
- Sorted alphabetically before generation

**Validation Rules**:
- `code` MUST NOT be empty string
- `code` SHOULD follow locale format (not enforced in quick fix)
- Exactly one language MUST have `isDefault: true`

---

### LanguageBlockQuickFixContext

Context information needed to generate a language block quick fix.

```typescript
/**
 * Context for generating language block quick fix
 */
export interface LanguageBlockQuickFixContext {
  /**
   * URI of the document being edited
   */
  documentUri: string;

  /**
   * Paths to labels files imported in the document
   * Can be relative or absolute paths
   */
  labelsFilePaths: string[];

  /**
   * Position where language block should be inserted
   */
  insertionPosition: InsertionPosition;

  /**
   * Extracted language codes (empty if parsing failed)
   * If empty, template will be generated
   */
  languageCodes: LanguageCodeInfo[];

  /**
   * Whether any labels files failed to parse
   * Used to generate appropriate code action title
   */
  hasParseErrors: boolean;
}
```

**Usage**:
- Built by `LanguageBlockCodeActionProvider.provideCodeActions()`
- Passed to `LanguageBlockGenerator.generate()`
- Contains all information needed to generate the workspace edit

**Lifecycle**:
1. Provider detects missing language block
2. Provider extracts labels file paths from imports
3. Provider parses labels files → `languageCodes`
4. Provider determines insertion position
5. Provider constructs context
6. Generator uses context to create formatted text

---

### InsertionPosition

Represents a line and column position in a text document for insertion.

```typescript
/**
 * Position in document for inserting language block
 */
export interface InsertionPosition {
  /**
   * Zero-based line number
   */
  line: number;

  /**
   * Zero-based character offset within the line
   * Typically 0 (start of line) for language block insertion
   */
  character: number;
}
```

**Usage**:
- Returned by `FilePositionHelper.findInsertionPosition()`
- Used in workspace edit range
- Matches LSP `Position` type structure

**Examples**:
- Empty file: `{ line: 0, character: 0 }`
- After comments: `{ line: 3, character: 0 }` (if comments end at line 2)
- Before first import: `{ line: 5, character: 0 }` (if import starts at line 5)

---

### LabelGroup (from labels JSON schema)

Represents the structure of labels JSON file (for reference, not exported).

```typescript
/**
 * Structure of a label group in labels JSON file
 * This is the external data format, not part of quick fix API
 */
interface LabelGroup {
  /**
   * Unique identifier for this label group
   */
  id: string;

  /**
   * Array of labels for different languages
   */
  labels: Label[];
}

/**
 * Individual label within a label group
 */
interface Label {
  /**
   * Unique identifier for this specific label
   */
  id: string;

  /**
   * Language code (e.g., "en-US", "nl-NL")
   */
  languageCode: string;

  /**
   * The actual label text
   */
  label: string;
}
```

**Usage**:
- Used internally by `LabelsParser.extractLanguageCodes()`
- Parsed from JSON files
- Not exposed in public API (internal implementation detail)

---

## Derived Types

### LanguageBlockGenerationResult

Result of generating a language block (text and metadata).

```typescript
/**
 * Result of language block generation
 */
export interface LanguageBlockGenerationResult {
  /**
   * The generated language block text
   * Includes opening/closing braces, newlines, and whitespace
   */
  text: string;

  /**
   * Number of language entries in the block
   */
  languageCount: number;

  /**
   * Whether this is a template (generated without parsing labels file)
   */
  isTemplate: boolean;
}
```

**Usage**:
- Returned by `LanguageBlockGenerator.generate()`
- `text` is used in workspace edit `newText`
- Metadata useful for code action title

**Example Values**:

Success case:
```typescript
{
  text: 'languages {\n  * "en-US" "en-US label"\n  "nl-NL" "nl-NL label"\n}\n\n',
  languageCount: 2,
  isTemplate: false
}
```

Template case:
```typescript
{
  text: 'languages {\n  * "en-US" "en-US label"\n}\n\n',
  languageCount: 1,
  isTemplate: true
}
```

---

### ParsedLabelsFile

Internal type representing parsed labels file with metadata.

```typescript
/**
 * Parsed labels file with extracted language codes
 * Internal type used by LabelsParser
 */
export interface ParsedLabelsFile {
  /**
   * Path to the labels file
   */
  filePath: string;

  /**
   * Extracted language codes (deduplicated)
   */
  languageCodes: string[];

  /**
   * Whether parsing succeeded
   */
  success: boolean;

  /**
   * Error message if parsing failed
   */
  error?: string;
}
```

**Usage**:
- Internal to `LabelsParser`
- One instance per labels file
- Aggregated when multiple imports exist

---

## Enums

### CodeActionKind

Standard LSP code action kinds (from `vscode-languageserver-protocol`).

```typescript
/**
 * Standard LSP code action kinds
 * Re-exported from vscode-languageserver-protocol
 */
export enum CodeActionKind {
  QuickFix = 'quickfix',        // For fixing problems
  Refactor = 'refactor',         // For refactoring
  Source = 'source',             // For source actions (organize imports, etc.)
}
```

**Usage**:
- Used in `CodeAction.kind` field
- Language block quick fix uses `CodeActionKind.QuickFix`

---

## Type Guards

### isValidLanguageCode

Type guard for validating language code format.

```typescript
/**
 * Type guard for validating language code format
 * @param code - Potential language code string
 * @returns True if code matches expected format (non-empty string)
 */
export function isValidLanguageCode(code: unknown): code is string {
  return typeof code === 'string' && code.trim().length > 0;
}
```

**Usage**:
- Used in defensive parsing
- Filters out null/undefined/empty values
- Note: Does NOT validate ISO format (intentional - per research decision)

---

## Constants

### Default Language Configuration

```typescript
/**
 * Default language code used in templates
 */
export const DEFAULT_LANGUAGE_CODE = 'en-US';

/**
 * Default label text for template generation
 * Uses language code as placeholder
 */
export const DEFAULT_LABEL_TEXT = (code: string) => `${code} label`;
```

**Usage**:
- Used when labels file missing/invalid
- Used as fallback in error cases

---

### Formatting Constants

```typescript
/**
 * Indentation for language block entries
 */
export const LANGUAGE_ENTRY_INDENT = '  '; // 2 spaces

/**
 * Default marker for default language
 */
export const DEFAULT_LANGUAGE_MARKER = '*';

/**
 * Newlines after language block for separation
 */
export const LANGUAGE_BLOCK_TRAILING_NEWLINES = '\n\n';
```

**Usage**:
- Used in `LanguageBlockGenerator.generate()`
- Ensures consistent formatting

---

## Relationships

### Entity Relationship Diagram

```
┌─────────────────────────────┐
│ LanguageBlockQuickFixContext│
│ (aggregation root)          │
└─────────────┬───────────────┘
              │
              │ contains
              ├─────────────────────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ LanguageCodeInfo[]      │   │ InsertionPosition       │
│ (extracted codes)       │   │ (where to insert)       │
└─────────────────────────┘   └─────────────────────────┘
              │
              │ generated from
              │
              ▼
┌─────────────────────────┐
│ LabelGroup[]            │
│ (parsed from JSON)      │
└─────────────────────────┘
              │
              │ contains
              │
              ▼
┌─────────────────────────┐
│ Label[]                 │
│ (individual labels)     │
└─────────────────────────┘
```

### Data Flow

```
Labels JSON File
    │
    ▼
LabelsParser.extractLanguageCodes()
    │
    ▼
LanguageCodeInfo[]
    │
    ├──────────────────────────────────┐
    │                                  │
    ▼                                  ▼
FilePositionHelper              LanguageBlockGenerator
.findInsertionPosition()        .generate()
    │                                  │
    ▼                                  ▼
InsertionPosition              LanguageBlockGenerationResult
    │                                  │
    └──────────────┬───────────────────┘
                   │
                   ▼
         LanguageBlockQuickFixContext
                   │
                   ▼
         CodeAction (with WorkspaceEdit)
```

---

## Validation Rules

### LanguageCodeInfo Validation
- At least one language code MUST exist in generated block
- Exactly one language MUST have `isDefault: true`
- Language codes MUST be unique (no duplicates)
- Language codes MUST be sorted alphabetically

### InsertionPosition Validation
- Line number MUST be >= 0
- Character offset MUST be >= 0
- Position MUST be before first non-comment token (for correctness)

### LanguageBlockGenerationResult Validation
- Generated text MUST be valid Langium LanguagesBlock syntax
- Text MUST end with double newline for separation
- languageCount MUST match actual number of entries in text

---

## Future Extensions

### Potential Additions (Out of Scope for MVP)

1. **LanguageCodeMetadata**: Additional metadata (display name, flag icon, etc.)
2. **LanguageBlockValidationResult**: Validation of existing language blocks
3. **LanguageCodeSuggestion**: AI-powered suggestions based on content
4. **LanguageBlockRefactoringContext**: For refactoring actions (add/remove languages)

These are NOT part of the current implementation but documented for future consideration.

---

## Summary

**Core Entities**: 3 (LanguageCodeInfo, LanguageBlockQuickFixContext, InsertionPosition)
**Derived Types**: 2 (LanguageBlockGenerationResult, ParsedLabelsFile)
**Total Types**: 8 (including internal types like LabelGroup)

**Complexity**: Low - Simple data structures with clear relationships

**Key Design Principles**:
- Immutable data structures (no state mutation)
- Clear separation of concerns (parsing vs generation vs positioning)
- Type safety (TypeScript interfaces with validation)
- Minimal dependencies (only LSP types and built-in types)
