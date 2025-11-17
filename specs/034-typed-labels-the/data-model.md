# Data Model: Typed Labels Validation

**Feature**: 034-typed-labels-the  
**Date**: 2025-11-17

## Overview

This document defines the data structures for label ID type validation, including Typir type properties, registry schema, and metadata interfaces.

## Core Entities

### LabelIDType (Typir CustomKind)

**Purpose**: Represents a validated reference to a label group from imported labels JSON

**Properties**:
```typescript
interface LabelIDTypeProperties {
  /** Label group ID from labels JSON (e.g., "welcome-title") */
  labelGroupId: string;
  
  /** Number of translations for this label group */
  translationCount: number;
  
  /** Language codes for all translations (e.g., ["en-US", "nl-NL"]) */
  languageCodes: string[];
  
  /** Index signature required by Typir CustomTypeProperties */
  [key: string]: string | number | string[];
}
```

**Type Name Format**: `LabelID<labelGroupId>`
**Example**: `LabelID<welcome-title>`

**Type Identifier Format**: `LabelID<labelGroupId>:translationCount`
**Example**: `LabelID<welcome-title>:2`

### LabelGroupMetadata

**Purpose**: Metadata for a single label group extracted from labels JSON

**Structure**:
```typescript
interface LabelGroupMetadata {
  /** Label group ID */
  id: string;
  
  /** Number of translations */
  translationCount: number;
  
  /** Language codes for translations */
  languageCodes: string[];
}
```

**Example**:
```typescript
{
  id: "welcome-title",
  translationCount: 2,
  languageCodes: ["en-US", "nl-NL"]
}
```

### Label Registry

**Purpose**: Tracks available label IDs for each Eligian document

**Structure**:
```typescript
class LabelRegistryService {
  /** Map from document URI to label metadata */
  private labelsByDocument: Map<string, Set<LabelGroupMetadata>>;
  
  /** Map from document URI to labels file URI (for hot-reload) */
  private labelsFileByDocument: Map<string, string>;
}
```

**Key Operations**:
- `updateLabelsFile(fileUri, metadata)` - Update label metadata for a file
- `registerImports(documentUri, labelsFileUri)` - Register which labels file a document imports
- `getLabelIDsForDocument(documentUri)` - Get all label IDs for a document
- `findLabelMetadata(documentUri, labelId)` - Find metadata for specific label ID
- `clearDocument(documentUri)` - Clear document data on close

## Data Flow

### 1. Labels File Parsing → Registry

```
labels.json
↓ (parse)
[
  {id: "welcome-title", labels: [{...}, {...}]},
  {id: "button-text", labels: [{...}]}
]
↓ (extract metadata)
[
  {id: "welcome-title", translationCount: 2, languageCodes: ["en-US", "nl-NL"]},
  {id: "button-text", translationCount: 2, languageCodes: ["en-US", "nl-NL"]}
]
↓ (register)
LabelRegistryService.updateLabelsFile("file:///labels.json", metadata)
```

### 2. Document Import → Registry Linkage

```
Eligian program:
  labels "./labels.json"
↓ (validation)
LabelRegistryService.registerImports(
  "file:///program.eligian",
  "file:///labels.json"
)
```

### 3. Parameter Validation → Type Inference

```
Operation call: requestLabelData("welcome-title")
↓ (check metadata)
Parameter has ParameterType:labelId
↓ (infer type)
Create LabelID<welcome-title> type
↓ (validate)
Check if "welcome-title" exists in registry for this document
↓ (result)
Valid: No error
Invalid: Error + Levenshtein suggestions
```

## Validation Rules

### Rule 1: Label ID Exists

**Check**: Label ID exists in registry for the document
**Error Code**: `unknown_label_id`
**Error Message**: `Unknown label ID: '{labelId}'`
**Hint**: `Did you mean: '{suggestion}'?` (if Levenshtein distance ≤ 2)

### Rule 2: Labels Import Required

**Check**: Document has labels import if using label ID parameters
**Error Code**: `no_labels_import`
**Error Message**: `Label ID parameter used but no labels imported`
**Hint**: `Add a labels import statement: labels "./labels.json"`

### Rule 3: Array Element Validation

**Check**: Each array element is a valid label ID
**Error Code**: `unknown_label_id` (per element)
**Behavior**: Validate each element independently, report all errors

## Hover Information Format

### Format

```
LabelID<{labelGroupId}>

Translations: {translationCount}
Languages: {languageCodes.join(', ')}
```

### Examples

**Single Translation**:
```
LabelID<welcome-title>

Translations: 1
Languages: en-US
```

**Multiple Translations**:
```
LabelID<welcome-title>

Translations: 2
Languages: en-US, nl-NL
```

**Invalid Label ID**:
```
unknown

No label metadata available
```

## Registry Update Strategy

### Initial Load
1. Parse labels JSON file
2. Extract label group metadata
3. Call `updateLabelsFile(fileUri, metadata)`

### Hot-Reload (when labels file changes)
1. File watcher detects change
2. Re-parse labels JSON
3. Call `updateLabelsFile(fileUri, newMetadata)` (replaces old)
4. Trigger re-validation of importing documents

### Document Close
1. Call `clearDocument(documentUri)`
2. Remove document → labels file mapping
3. Remove label metadata for that document

## Edge Cases

### Duplicate Label IDs in JSON
**Behavior**: First occurrence wins (per Eligius runtime)
**Registry**: Only stores first metadata entry

### Empty Labels File
**Behavior**: Registry stores empty set for document
**Validation**: All label ID parameters produce errors

### No Labels Import
**Behavior**: Registry has no data for document
**Validation**: All label ID parameters produce "no import" error

---

**Status**: Data model complete. Proceed to contracts generation.
