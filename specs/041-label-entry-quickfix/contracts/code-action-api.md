# Code Action API Contract

**Feature**: 041-label-entry-quickfix
**Date**: 2025-11-29

## Overview

This document defines the API contract between the language server (code action provider) and the VS Code extension (command handler) for the missing label entry quick fix.

## Code Action Response

### Trigger Condition

The code action is offered when:
1. Diagnostic with code `unknown_label_id` exists at cursor position
2. The document has a valid labels import pointing to an existing file
3. The labels file contains valid JSON

### Code Action Format

```typescript
{
  title: "Create label entry 'labelId'",
  kind: CodeActionKind.QuickFix,
  diagnostics: [/* The triggering diagnostic */],
  command: {
    title: "Create label entry 'labelId'",
    command: "eligian.createLabelEntry",
    arguments: [CreateLabelEntryCommand]
  }
}
```

## Command Contract

### Command Name

```
eligian.createLabelEntry
```

### Command Arguments

```typescript
interface CreateLabelEntryCommand {
  /**
   * Absolute file system path of the labels file.
   * Must be an existing, writable file containing valid JSON.
   * @example "C:/projects/app/labels.json"
   */
  labelsFilePath: string;

  /**
   * The label ID for the new entry.
   * Must not already exist in the labels file.
   * @example "welcomeMessage"
   */
  labelId: string;

  /**
   * Language codes to create translations for.
   * Order is preserved from the languages block.
   * Falls back to ["en-US"] if no languages block.
   * @example ["en-US", "nl-NL"]
   */
  languageCodes: string[];

  /**
   * URI of the Eligian document that triggered the quick fix.
   * Used for context/logging only.
   * @example "file:///c%3A/projects/app/main.eligian"
   */
  documentUri: string;
}
```

### Command Response

The command handler MUST return a `Promise<LabelEntryCreationResult>`:

```typescript
interface LabelEntryCreationResult {
  /**
   * Whether the label entry was successfully created.
   */
  success: boolean;

  /**
   * The label ID that was created (echoed from input).
   */
  labelId: string;

  /**
   * Path to the modified labels file.
   */
  labelsFilePath: string;

  /**
   * Error details if operation failed.
   * MUST be present if success is false.
   */
  error?: {
    code: 'INVALID_JSON' | 'FILE_READ_ERROR' | 'FILE_WRITE_ERROR' | 'LABEL_EXISTS';
    message: string;
    cause?: Error;
  };
}
```

## Error Handling

### Error Codes

| Code | Description | User Message |
|------|-------------|--------------|
| `INVALID_JSON` | Labels file contains invalid JSON | "Cannot modify labels file: invalid JSON format" |
| `FILE_READ_ERROR` | Cannot read labels file | "Cannot read labels file: {details}" |
| `FILE_WRITE_ERROR` | Cannot write to labels file | "Cannot write to labels file: {details}" |
| `LABEL_EXISTS` | Label ID already exists | "Label '{labelId}' already exists in the labels file" |

### Error Display

On error, the extension MUST:
1. Show an error notification via `vscode.window.showErrorMessage()`
2. Include actionable information (file path, specific error)
3. NOT throw an unhandled exception

## Generated Label Entry Format

The command handler MUST generate a label entry matching this format:

```json
{
  "id": "{labelId}",
  "labels": [
    {
      "id": "{uuid-v4}",
      "languageCode": "{languageCode1}",
      "label": ""
    },
    {
      "id": "{uuid-v4}",
      "languageCode": "{languageCode2}",
      "label": ""
    }
  ]
}
```

Requirements:
- Each translation entry MUST have a unique UUID v4 `id`
- `label` MUST be empty string `""`
- Translation entries MUST be in the same order as `languageCodes` input
- The entry MUST be appended to the existing labels array

## File Modification Contract

1. **Read**: Read entire file content as UTF-8
2. **Parse**: Parse as JSON array
3. **Validate**: Ensure it's a valid array (not null, not object)
4. **Append**: Add new entry to end of array
5. **Serialize**: Stringify with 2-space indentation
6. **Write**: Write atomically (temp file + rename, or direct write)

## Hot-Reload Integration

After successful file modification:
- The extension MUST NOT manually update the labels registry
- The existing `LabelsWatcherManager` will detect the file change
- The registry will be updated automatically via hot-reload

## LSP Diagnostic Enhancement

The validator MUST include extended data in `unknown_label_id` diagnostics:

```typescript
accept('error', `${error.message}. ${error.hint}`, {
  node: labelIdArg,
  data: {
    code: 'unknown_label_id',
    labelId: labelIdValue,            // NEW: The missing label ID
    labelsFileUri: labelsFileUri,     // NEW: URI of labels file
    languageCodes: languageCodes      // NEW: From languages block
  }
});
```

This enables the code action provider to generate the command without re-parsing.
