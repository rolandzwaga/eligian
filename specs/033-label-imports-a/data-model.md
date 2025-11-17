# Data Model: Label Imports

**Date**: 2025-11-17
**Phase**: 1 - Design & Contracts

## Overview

The Label Imports feature enables importing multi-language label translations from JSON files into Eligian programs. Labels are used by the Eligius `LabelController` to display localized text based on the user's selected language.

## Entity Definitions

### Label Group (`ILanguageLabel`)

**Purpose**: Represents a collection of translations for a single label identifier.

**TypeScript Definition** (from Eligius):
```typescript
interface ILanguageLabel {
  id: string;
  labels: ILabel[];
}
```

**Properties**:
- `id` (string, required): Unique identifier for this label group
  - Used to reference the label in Eligius operations
  - Example: `"mainTitle"`, `"welcomeMessage"`, `"buttonText"`
  - Must be non-empty (validated by schema)
- `labels` (array of ILabel, required): Array of translations for different languages
  - Must contain at least one translation (validated by schema)
  - Multiple translations enable multi-language support

**Example**:
```json
{
  "id": "mainTitle",
  "labels": [
    {"id": "111", "languageCode": "en-US", "label": "Welcome"},
    {"id": "222", "languageCode": "nl-NL", "label": "Welkom"}
  ]
}
```

**Relationships**:
- **Contains**: Multiple `ILabel` (Label Translation) entities
- **Belongs to**: `IEngineConfiguration.labels` array

### Label Translation (`ILabel`)

**Purpose**: Represents a single language translation of a label.

**TypeScript Definition** (from Eligius):
```typescript
interface ILabel {
  id: string;
  languageCode: string;
  label: string;
}
```

**Properties**:
- `id` (string, required): Unique identifier for this translation
  - Typically a numeric ID or UUID
  - Example: `"111"`, `"en-translation-1"`
  - Must be non-empty (validated by schema)
- `languageCode` (string, required): Language code for this translation
  - Standard format: BCP 47 language tags (e.g., `"en-US"`, `"nl-NL"`, `"fr-FR"`)
  - Schema does not enforce specific format (per spec assumptions)
  - Must be at least 2 characters (validated by schema)
- `label` (string, required): The translated label text
  - The actual text displayed to users
  - Example: `"Welcome"`, `"Welkom"`, `"Bienvenue"`
  - Must be non-empty (validated by schema)

**Example**:
```json
{
  "id": "111",
  "languageCode": "en-US",
  "label": "Welcome to our application"
}
```

**Relationships**:
- **Belongs to**: `ILanguageLabel` (Label Group)

## Data Flow

### Loading Lifecycle

```
1. Eligian Source File
   ↓
   labels './labels.json'
   ↓
2. Compiler Pipeline (pipeline.ts)
   ↓
   - Extract DefaultImport statements with type='labels'
   - Resolve relative file path to absolute path
   - Read JSON file content
   ↓
3. JSON Parsing
   ↓
   - Parse JSON string to JavaScript object
   - Catch syntax errors (unclosed brackets, etc.)
   ↓
4. Schema Validation (AJV)
   ↓
   - Validate structure against labels-schema.json
   - Check required fields, types, constraints
   - Collect validation errors
   ↓
5. Type Assertion
   ↓
   - If valid: data is ILanguageLabel[]
   - If invalid: report errors to user
   ↓
6. Transformer (ast-transformer.ts)
   ↓
   - Receive labels via ProgramAssets.labels
   - Assign to config.labels
   ↓
7. Eligius Configuration (output)
   ↓
   {
     "id": "...",
     "labels": [...],  // ← Labels data here
     "timelines": [...],
     ...
   }
```

### Error States

```
File Not Found
├─ Error Code: labels_file_not_found
├─ Message: "Cannot find labels file: {path}"
└─ Hint: "Ensure the file exists and the path is correct"

JSON Syntax Error
├─ Error Code: invalid_labels_json
├─ Message: "Invalid JSON syntax in labels file: {error}"
└─ Hint: "Check for missing commas, unclosed brackets, or trailing commas"

Schema Validation Error
├─ Error Code: invalid_labels_schema
├─ Message: "Labels file does not match required structure: {details}"
└─ Hint: "See schema documentation for correct format"

Absolute Path Error
├─ Error Code: absolute_path_not_allowed
├─ Message: "Labels import must use relative path, not absolute"
└─ Hint: "Use './labels.json' instead of absolute paths"

Duplicate Import Error
├─ Error Code: duplicate_default_import
├─ Message: "Only one labels import allowed per program"
└─ Hint: "Remove duplicate labels import statements"
```

## Validation Rules

### File-Level Validation

1. **File Existence**: Labels file must exist at specified path
2. **File Accessibility**: Labels file must be readable (permissions)
3. **UTF-8 Encoding**: Labels file must be valid UTF-8 text
4. **JSON Syntax**: File content must be valid JSON
5. **Root Type**: Parsed JSON must be an array

### Schema Validation

1. **Label Group Structure**:
   - Must have `id` property (string, non-empty)
   - Must have `labels` property (array, at least 1 item)
   - May have additional properties (forward compatibility)

2. **Label Translation Structure**:
   - Must have `id` property (string, non-empty)
   - Must have `languageCode` property (string, at least 2 characters)
   - Must have `label` property (string, non-empty)
   - May have additional properties (forward compatibility)

### Import-Level Validation

1. **Path Type**: Only relative paths allowed (not absolute)
2. **Import Uniqueness**: At most one labels import per program
3. **Path Format**: Path must be a string literal

## Edge Cases

### Empty Arrays

**Empty Label Groups Array**:
```json
[]
```
- **Valid**: Yes (schema allows empty array at root)
- **Behavior**: `config.labels` will be empty array
- **Use Case**: Program with no labels (labels import is optional)

**Empty Translations Array**:
```json
[
  {
    "id": "mainTitle",
    "labels": []
  }
]
```
- **Valid**: No (schema requires `minItems: 1`)
- **Error**: "Label group 'mainTitle' must have at least one translation"

### Duplicate IDs

**Duplicate Label Group IDs**:
```json
[
  {"id": "title", "labels": [...]},
  {"id": "title", "labels": [...]}
]
```
- **Valid**: Yes (schema does not enforce uniqueness)
- **Behavior**: Both label groups included in config
- **Rationale**: Runtime behavior is Eligius library's responsibility

**Duplicate Language Codes**:
```json
{
  "id": "mainTitle",
  "labels": [
    {"id": "111", "languageCode": "en-US", "label": "Hello"},
    {"id": "222", "languageCode": "en-US", "label": "Hi"}
  ]
}
```
- **Valid**: Yes (schema does not enforce uniqueness)
- **Behavior**: Both translations included in config
- **Rationale**: Runtime behavior is Eligius library's responsibility

### Additional Properties

**Extra Fields in Label Group**:
```json
{
  "id": "mainTitle",
  "labels": [...],
  "customMetadata": "some value"
}
```
- **Valid**: Yes (`additionalProperties: true`)
- **Behavior**: Extra fields preserved in output
- **Rationale**: Forward compatibility with future Eligius versions

**Extra Fields in Translation**:
```json
{
  "id": "111",
  "languageCode": "en-US",
  "label": "Hello",
  "pronunciation": "heh-loh"
}
```
- **Valid**: Yes (`additionalProperties: true`)
- **Behavior**: Extra fields preserved in output
- **Rationale**: Forward compatibility

### Special Characters

**Unicode in Labels**:
```json
{
  "id": "greeting",
  "languageCode": "ja-JP",
  "label": "こんにちは"
}
```
- **Valid**: Yes (UTF-8 encoding supports all Unicode)
- **Behavior**: Characters preserved correctly in output

**Whitespace in IDs**:
```json
{
  "id": "main title"
}
```
- **Valid**: Yes (schema allows any non-empty string)
- **Behavior**: ID used as-is (spaces preserved)
- **Note**: May cause issues in Eligius runtime (recommend validation)

## Usage Examples

### Simple Multi-Language Labels

```json
[
  {
    "id": "welcomeMessage",
    "labels": [
      {"id": "1", "languageCode": "en-US", "label": "Welcome!"},
      {"id": "2", "languageCode": "nl-NL", "label": "Welkom!"}
    ]
  },
  {
    "id": "goodbye",
    "labels": [
      {"id": "3", "languageCode": "en-US", "label": "Goodbye"},
      {"id": "4", "languageCode": "nl-NL", "label": "Tot ziens"}
    ]
  }
]
```

### Complex Label Group

```json
[
  {
    "id": "userInterface",
    "labels": [
      {"id": "ui-1", "languageCode": "en-US", "label": "Click here to continue"},
      {"id": "ui-2", "languageCode": "nl-NL", "label": "Klik hier om door te gaan"},
      {"id": "ui-3", "languageCode": "fr-FR", "label": "Cliquez ici pour continuer"},
      {"id": "ui-4", "languageCode": "de-DE", "label": "Klicken Sie hier, um fortzufahren"}
    ]
  }
]
```

## Integration with Eligius

### LabelController Usage

Once labels are loaded into the Eligius configuration, they can be referenced using the `LabelController`:

```typescript
// Eligius runtime (conceptual example)
const labelController = new LabelController(config.labels);

// Get label for current language
const welcomeText = labelController.getLabel("welcomeMessage", "en-US");
// Returns: "Welcome!"

// Switch language
const welcomeTextNL = labelController.getLabel("welcomeMessage", "nl-NL");
// Returns: "Welkom!"
```

**Note**: Actual LabelController API may differ - see Eligius documentation.

## Future Considerations

### Potential Enhancements (Not in Current Spec)

- **Label ID uniqueness validation**: Warn if duplicate label group IDs exist
- **Language code format validation**: Enforce BCP 47 format
- **Translation completeness check**: Warn if label groups have different language sets
- **Label text placeholder syntax**: Support `{variable}` syntax for dynamic labels

These are NOT part of the current specification and should only be added if explicitly requested by users.
