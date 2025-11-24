# Data Model: Label File Creation Quick Fix

**Feature**: 039-label-file-creation-quickfix
**Date**: 2025-11-24
**Status**: Complete

## Overview

This document defines the data structures and entities involved in the label file creation quick fix feature. These models represent the data passed between the language server and extension, as well as the structure of generated labels files.

## Core Entities

### 1. CreateLabelsFileCommand

**Purpose**: Command arguments passed from language server to extension when executing the "Create labels file" quick fix.

**Properties**:
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `filePath` | `string` | Yes | Absolute file system path where the labels file should be created |
| `content` | `string` | Yes | JSON content to write to the file (either `[]` or template with example entry) |
| `documentUri` | `string` | Yes | URI of the Eligian document that triggered the quick fix (for context) |
| `languageCodes` | `string[]` | No | List of language codes extracted from languages block (for logging/telemetry) |

**Validation Rules**:
- `filePath` must be an absolute path (no relative paths)
- `filePath` must have `.json` extension
- `content` must be valid JSON
- `documentUri` must be a valid file:// URI

**Example**:
```typescript
{
  filePath: "C:\\Users\\dev\\project\\labels\\app.json",
  content: '[{"id":"example.label","nl-NL":"Voorbeeld NL","en-US":"Example EN"}]',
  documentUri: "file:///c:/Users/dev/project/app.eligian",
  languageCodes: ["nl-NL", "en-US"]
}
```

---

### 2. LabelsFileTemplate

**Purpose**: Represents the structure of a labels file template entry generated when a languages block exists.

**Properties**:
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Label identifier (always "example.label" for templates) |
| `[languageCode]` | `string` | Yes (per language) | Placeholder text for each language code |

**Validation Rules**:
- `id` must be a valid label identifier (alphanumeric, dots, hyphens, underscores)
- Each language code key must match pattern: `/^[a-z]{2}-[A-Z]{2}$/` (e.g., "en-US", "nl-NL")
- Placeholder text should be in format: "{Language Name} {Code}" (e.g., "Example EN")

**Example**:
```json
{
  "id": "example.label",
  "nl-NL": "Voorbeeld NL",
  "en-US": "Example EN",
  "fr-FR": "Exemple FR"
}
```

**Generated Array**:
```json
[
  {
    "id": "example.label",
    "nl-NL": "Voorbeeld NL",
    "en-US": "Example EN",
    "fr-FR": "Exemple FR"
  }
]
```

---

### 3. MissingLabelsFileDiagnostic

**Purpose**: Diagnostic information for a missing labels file detected by the validator.

**Properties**:
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `code` | `string` | Yes | Diagnostic code (value: "missing_labels_file") |
| `message` | `string` | Yes | Error message displayed to user |
| `severity` | `DiagnosticSeverity` | Yes | Severity level (Error) |
| `range` | `Range` | Yes | Source location of the labels import statement |
| `relatedInformation` | `DiagnosticRelatedInformation[]` | No | Additional context (e.g., path being referenced) |
| `data` | `MissingLabelsFileData` | Yes | Custom data for code action provider |

**MissingLabelsFileData** (nested):
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `importPath` | `string` | Yes | Original import path from the labels import statement |
| `resolvedPath` | `string` | Yes | Absolute file system path (resolved from import path) |
| `hasLanguagesBlock` | `boolean` | Yes | Whether the Eligian file has a languages block |
| `languageCodes` | `string[]` | No | Language codes if languages block exists |

**Example**:
```typescript
{
  code: "missing_labels_file",
  message: "Labels file './labels/app.json' does not exist",
  severity: DiagnosticSeverity.Error,
  range: { start: { line: 2, character: 7 }, end: { line: 2, character: 28 } },
  data: {
    importPath: "./labels/app.json",
    resolvedPath: "C:\\Users\\dev\\project\\labels\\app.json",
    hasLanguagesBlock: true,
    languageCodes: ["nl-NL", "en-US"]
  }
}
```

---

### 4. FileCreationResult

**Purpose**: Result of file creation operation (for error handling and telemetry).

**Properties**:
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | `boolean` | Yes | Whether file creation succeeded |
| `filePath` | `string` | Yes | Absolute path to the created file |
| `error` | `FileCreationError` | No | Error details if creation failed |
| `editorOpened` | `boolean` | Yes | Whether label editor opened successfully |

**FileCreationError** (nested):
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `code` | `FileErrorCode` | Yes | Error code (enum) |
| `message` | `string` | Yes | Human-readable error message |
| `cause` | `Error` | No | Original error object (for logging) |

**FileErrorCode** (enum):
```typescript
enum FileErrorCode {
  InvalidPath = "INVALID_PATH",
  PermissionDenied = "PERMISSION_DENIED",
  FileSystemError = "FILE_SYSTEM_ERROR",
  EditorNotFound = "EDITOR_NOT_FOUND"
}
```

**Example (Success)**:
```typescript
{
  success: true,
  filePath: "C:\\Users\\dev\\project\\labels\\app.json",
  editorOpened: true
}
```

**Example (Failure)**:
```typescript
{
  success: false,
  filePath: "C:\\Users\\dev\\project\\labels\\app.json",
  error: {
    code: FileErrorCode.PermissionDenied,
    message: "Cannot create directory: Permission denied",
    cause: new Error("EACCES")
  },
  editorOpened: false
}
```

---

## Entity Relationships

```
┌─────────────────────────────┐
│ MissingLabelsFileDiagnostic │
│ (Language Server)           │
└──────────────┬──────────────┘
               │ triggers
               ↓
┌─────────────────────────────┐
│ Code Action                 │
│ (Language Server)           │
│ - title: "Create labels     │
│          file"              │
│ - command: eligian.         │
│           createLabelsFile  │
└──────────────┬──────────────┘
               │ executes
               ↓
┌─────────────────────────────┐
│ CreateLabelsFileCommand     │
│ (Extension)                 │
└──────────────┬──────────────┘
               │ uses
               ↓
┌─────────────────────────────┐
│ LabelsFileTemplate          │
│ (if languages block exists) │
└──────────────┬──────────────┘
               │ generates
               ↓
┌─────────────────────────────┐
│ JSON File Content           │
│ (File System)               │
└──────────────┬──────────────┘
               │ results in
               ↓
┌─────────────────────────────┐
│ FileCreationResult          │
│ (Extension)                 │
└─────────────────────────────┘
```

## State Transitions

### Labels File Creation Workflow

```
[Eligian File Opened]
         ↓
[Validator Detects Missing Labels File]
         ↓
[MissingLabelsFileDiagnostic Created] ← state: DIAGNOSTIC
         ↓
[Code Action Provider Invoked]
         ↓
[Quick Fix "Create labels file" Offered] ← state: ACTION_AVAILABLE
         ↓
[User Triggers Quick Fix]
         ↓
[CreateLabelsFileCommand Executed] ← state: CREATING
         ↓
    ┌────┴────┐
    ↓         ↓
[Success] [Failure] ← state: CREATED or ERROR
    ↓         ↓
[Open Editor] [Show Error Message]
    ↓
[FileCreationResult] ← state: COMPLETE
```

### Diagnostic Data Flow

```
1. Validator Phase:
   Program AST → Check labels imports → Missing file detected
   ↓
   Create MissingLabelsFileDiagnostic with data:
   - importPath (from AST)
   - resolvedPath (from path normalization)
   - hasLanguagesBlock (from Program.languages)
   - languageCodes (from languages block)

2. Code Action Phase:
   Diagnostic received → Extract data → Prepare command arguments
   ↓
   CreateLabelsFileCommand with:
   - filePath = data.resolvedPath
   - content = hasLanguagesBlock ? generateTemplate(languageCodes) : "[]"
   - documentUri = diagnostic source
   - languageCodes = data.languageCodes

3. Execution Phase:
   Command executed → Create directories → Write file → Open editor
   ↓
   FileCreationResult with success/error details
```

## Validation Rules Summary

### Path Validation
- Must be absolute path (no `../`, `./` prefixes after normalization)
- Must have `.json` extension
- Length ≤ 260 characters (Windows MAX_PATH)
- No invalid characters: `<>:"|?*` (Windows)
- No trailing spaces or dots in directory/file names

### Content Validation
- Must be valid JSON (parseable by `JSON.parse()`)
- Empty array `[]` is valid
- Template array must have exactly one object
- Template object must have `id` property
- Template object must have at least one language code property

### Language Code Validation
- Pattern: `[a-z]{2}-[A-Z]{2}` (ISO 639-1 + ISO 3166-1)
- Examples: `en-US`, `nl-NL`, `fr-FR`
- Maximum 50 language codes (per spec edge cases)

## Implementation Notes

### Type Definitions

These entities should be defined in TypeScript as:

**Location**: `packages/language/src/types/code-actions.ts` (new file)

```typescript
export interface CreateLabelsFileCommand {
  filePath: string;
  content: string;
  documentUri: string;
  languageCodes?: string[];
}

export interface LabelsFileTemplate {
  id: string;
  [languageCode: string]: string;
}

export interface MissingLabelsFileData {
  importPath: string;
  resolvedPath: string;
  hasLanguagesBlock: boolean;
  languageCodes?: string[];
}

export enum FileErrorCode {
  InvalidPath = "INVALID_PATH",
  PermissionDenied = "PERMISSION_DENIED",
  FileSystemError = "FILE_SYSTEM_ERROR",
  EditorNotFound = "EDITOR_NOT_FOUND"
}

export interface FileCreationError {
  code: FileErrorCode;
  message: string;
  cause?: Error;
}

export interface FileCreationResult {
  success: boolean;
  filePath: string;
  error?: FileCreationError;
  editorOpened: boolean;
}
```

### Data Persistence

**No persistent storage required** - All data is transient:
- Diagnostics are regenerated on document changes
- Command arguments are passed in-memory
- File creation results are logged but not stored
- Template structure is hardcoded (not configurable)

### Immutability

Per Constitution Principle VI (External Immutability):
- All exported types are immutable (readonly where appropriate)
- Internal implementations may mutate for performance (e.g., building JSON string)
- Command arguments are frozen before passing to extension
