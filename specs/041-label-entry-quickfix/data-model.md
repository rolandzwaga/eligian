# Data Model: Missing Label Entry Quick Fix

**Feature**: 041-label-entry-quickfix
**Date**: 2025-11-29

## Entities

### 1. Label Entry (ILanguageLabel)

Represents a single label group in the labels JSON file, following the Eligius schema.

```typescript
/**
 * A label group with translations for multiple languages.
 * Matches Eligius ILanguageLabel interface.
 */
interface LabelEntry {
  /** Unique identifier for this label group (e.g., "welcomeMessage") */
  id: string;

  /** Array of translations for different languages */
  labels: TranslationEntry[];
}
```

**Validation Rules**:
- `id` must be non-empty string
- `id` must be unique within the labels file
- `labels` must be non-empty array (at least one translation)

**State Transitions**: N/A (static data)

---

### 2. Translation Entry (ILabel)

Represents a single language translation within a label group.

```typescript
/**
 * A single translation for a specific language.
 * Matches Eligius ILabel interface.
 */
interface TranslationEntry {
  /** Unique identifier for this translation (UUID v4) */
  id: string;

  /** Language code in IETF format (e.g., "en-US", "nl-NL") */
  languageCode: string;

  /** The translated text (empty string for new entries) */
  label: string;
}
```

**Validation Rules**:
- `id` must be valid UUID v4 format
- `languageCode` must match pattern `^[a-z]{2,3}-[A-Z]{2,3}$`
- `label` can be empty string (for newly created entries)

**State Transitions**: N/A (static data)

---

### 3. Missing Label Diagnostic Data

Extended diagnostic data attached to `unknown_label_id` diagnostics.

```typescript
/**
 * Diagnostic data for missing label ID errors.
 * Extends existing diagnostic data with information needed for quick fix.
 */
interface MissingLabelIDData {
  /** Error code identifier */
  code: 'unknown_label_id';

  /** The label ID that was not found */
  labelId: string;

  /** Absolute URI of the labels file to modify */
  labelsFileUri: string;

  /** Language codes from the languages block (or default ["en-US"]) */
  languageCodes: string[];
}
```

**Validation Rules**:
- `labelId` must be non-empty string
- `labelsFileUri` must be valid file URI
- `languageCodes` must be non-empty array

**Relationships**:
- Associated with `unknown_label_id` diagnostics
- Used by code action provider to generate quick fix

---

### 4. Create Label Entry Command

Command arguments for the VS Code extension command.

```typescript
/**
 * Command arguments for creating a new label entry.
 * Passed from code action to extension command handler.
 */
interface CreateLabelEntryCommand {
  /** Absolute file system path of the labels file */
  labelsFilePath: string;

  /** The label ID for the new entry */
  labelId: string;

  /** Language codes to create translations for */
  languageCodes: string[];

  /** URI of the Eligian document (for context/logging) */
  documentUri: string;
}
```

**Validation Rules**:
- `labelsFilePath` must be valid file system path
- `labelId` must be non-empty string
- `languageCodes` must be non-empty array

---

### 5. Label Entry Creation Result

Result of the label entry creation operation.

```typescript
/**
 * Result of label entry creation operation.
 */
interface LabelEntryCreationResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** The label ID that was created */
  labelId: string;

  /** Path to the modified labels file */
  labelsFilePath: string;

  /** Error details if operation failed */
  error?: {
    code: 'INVALID_JSON' | 'FILE_READ_ERROR' | 'FILE_WRITE_ERROR' | 'LABEL_EXISTS';
    message: string;
    cause?: Error;
  };
}
```

**Validation Rules**:
- If `success` is false, `error` must be present
- If `success` is true, `error` must be undefined

---

## Entity Relationships

```
┌──────────────────────┐
│  Eligian Document    │
│  (Program AST)       │
└──────────┬───────────┘
           │ has
           ▼
┌──────────────────────┐     triggers      ┌──────────────────────┐
│  Languages Block     │◄──────────────────│  Code Action         │
│  (language codes)    │                   │  (unknown_label_id)  │
└──────────────────────┘                   └──────────┬───────────┘
                                                      │
                                                      │ creates
                                                      ▼
┌──────────────────────┐     modifies      ┌──────────────────────┐
│  Labels File         │◄──────────────────│  Label Entry         │
│  (ILanguageLabel[])  │                   │  (new entry)         │
└──────────────────────┘                   └──────────┬───────────┘
                                                      │
                                                      │ contains
                                                      ▼
                                           ┌──────────────────────┐
                                           │  Translation Entries │
                                           │  (one per language)  │
                                           └──────────────────────┘
```

## JSON Schema Reference

The labels file follows the existing schema at `packages/language/src/schemas/labels-schema.json`.

**Example Labels File**:
```json
[
  {
    "id": "existingLabel",
    "labels": [
      { "id": "550e8400-e29b-41d4-a716-446655440000", "languageCode": "en-US", "label": "Hello" },
      { "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8", "languageCode": "nl-NL", "label": "Hallo" }
    ]
  },
  {
    "id": "newLabel",
    "labels": [
      { "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "languageCode": "en-US", "label": "" },
      { "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "languageCode": "nl-NL", "label": "" }
    ]
  }
]
```

## TypeScript Type Definitions Location

New types will be added to `packages/language/src/types/code-actions.ts` alongside existing `MissingLabelsFileData` and `CreateLabelsFileCommand` types from Feature 039.
