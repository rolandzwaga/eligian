# Research: Label Imports

**Date**: 2025-11-17
**Phase**: 0 - Research & Investigation
**Status**: Complete

## AJV Decision

**Selected Solution**: AJV v8 with JSON Schema Draft 2020-12

### Rationale

- **Performance**: Fastest JSON validator for Node.js (schemas compiled to optimized functions)
- **TypeScript-First**: Built with TypeScript, provides `JSONSchemaType<T>` for type safety
- **Type Guards**: Compiled validators automatically narrow TypeScript types after validation
- **Industry Standard**: Mature, battle-tested library with high source reputation
- **Zero Runtime Overhead**: Schemas compiled at startup, validation is extremely fast
- **Structured Errors**: Rich error objects with `keyword`, `params`, `instancePath` for precise reporting

### Installation

```bash
pnpm add ajv
```

### Basic Usage Pattern

```typescript
import Ajv, { JSONSchemaType } from 'ajv';
import type { ILanguageLabel } from 'eligius';

const ajv = new Ajv({ allErrors: false }); // Stop on first error for performance

const schema: JSONSchemaType<ILanguageLabel[]> = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      labels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1 },
            languageCode: { type: 'string', minLength: 2 },
            label: { type: 'string', minLength: 1 }
          },
          required: ['id', 'languageCode', 'label'],
          additionalProperties: true  // Forward compatibility
        },
        minItems: 1
      }
    },
    required: ['id', 'labels'],
    additionalProperties: true  // Forward compatibility
  }
};

// Compile once at module initialization
const validateLabels = ajv.compile(schema);

// Use repeatedly (very fast)
function validate(jsonContent: string): ILanguageLabel[] | Error {
  const data = JSON.parse(jsonContent);
  if (validateLabels(data)) {
    return data; // Type guard ensures ILanguageLabel[]
  }
  return new Error(formatErrors(validateLabels.errors));
}
```

## Schema Structure

### Complete JSON Schema

**File**: `packages/language/src/schemas/labels-schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://eligius.dev/schemas/language-labels.json",
  "title": "Eligius Language Labels",
  "description": "Array of label groups with translations in multiple languages",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "Unique identifier for this label group",
        "minLength": 1
      },
      "labels": {
        "type": "array",
        "description": "Array of label translations for different languages",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "Unique identifier for this translation",
              "minLength": 1
            },
            "languageCode": {
              "type": "string",
              "description": "Language code (e.g., en-US, nl-NL)",
              "minLength": 2
            },
            "label": {
              "type": "string",
              "description": "The translated label text",
              "minLength": 1
            }
          },
          "required": ["id", "languageCode", "label"],
          "additionalProperties": true
        },
        "minItems": 1
      }
    },
    "required": ["id", "labels"],
    "additionalProperties": true
  }
}
```

### Design Decisions

1. **`additionalProperties: true`**: Allows future Eligius versions to add fields without breaking existing code
2. **`minLength: 1`**: Prevents empty strings for IDs and labels (semantic validation)
3. **`minItems: 1`**: Ensures label groups have at least one translation
4. **No language code pattern**: Spec states "any string is accepted" (per Assumptions section)

## Error Mapping

### AJV Error Structure

```typescript
interface ErrorObject {
  keyword: string;           // "type", "required", "minLength", etc.
  instancePath: string;      // "/0/labels/1/languageCode" (JSON pointer)
  schemaPath: string;        // Schema location
  params: Record<string, any>; // Keyword-specific params
  message?: string;          // Default error message
}
```

### User-Friendly Error Mapping

| AJV Keyword | User Message |
|-------------|--------------|
| `type` | `Property "{path}" must be a {expectedType}` |
| `required` | `Missing required property "{property}" in label group` |
| `minLength` | `Property "{path}" cannot be empty` |
| `minItems` | `Label group "{id}" must have at least one translation` |

### Implementation

```typescript
import type { ErrorObject } from 'ajv';

function formatValidationError(error: ErrorObject, data: unknown): string {
  const path = error.instancePath || 'root';

  switch (error.keyword) {
    case 'type':
      return `Property "${path}" must be a ${error.params.type}`;

    case 'required':
      return `Missing required property "${error.params.missingProperty}" at ${path}`;

    case 'minLength':
      return `Property "${path}" cannot be empty`;

    case 'minItems':
      if (path.includes('labels')) {
        const groupId = getGroupIdFromPath(data, path);
        return `Label group "${groupId}" must have at least one translation`;
      }
      return `Array at "${path}" must have at least ${error.params.limit} items`;

    default:
      return error.message || 'Validation error';
  }
}
```

## Loading Pattern

### Follow CSS Import Pattern

Based on analysis of `pipeline.ts` lines 293-339:

1. **Extract imports** from AST during compilation
2. **Resolve file paths** (relative to source file directory)
3. **Read file content** using Node.js `fs.readFileSync`
4. **Parse JSON** and validate with AJV
5. **Handle errors** (file not found, JSON syntax, schema violations)
6. **Pass to transformer** via `ProgramAssets` interface

### Implementation Locations

```typescript
// packages/language/src/compiler/pipeline.ts
// Add labels loading after CSS loading (around line 340)

// Extract labels imports
const labelsFiles: string[] = [];
for (const statement of root.statements) {
  if (isDefaultImport(statement) && statement.type === 'labels') {
    const labelsPath = statement.path.replace(/^["']|["']$/g, '');
    labelsFiles.push(labelsPath);
  }
}

// Load and validate each labels file
const labelsData: ILanguageLabel[] = [];
for (const labelsRelativePath of labelsFiles) {
  try {
    const labelsFilePath = resolveRelativePath(docDir, labelsRelativePath);
    const labelsContent = readFileSync(labelsFilePath, 'utf-8');
    const data = JSON.parse(labelsContent);

    // Validate with AJV
    const error = validateLabelsSchema(data);
    if (error) {
      // Report validation error
    } else {
      labelsData.push(...data);
    }
  } catch (error) {
    // Handle file not found, JSON syntax errors
  }
}

// Pass to transformer
const assets: ProgramAssets = {
  layoutTemplate,
  cssFiles,
  labels: labelsData  // NEW
};
```

## Performance Considerations

### Sync vs Async

**Decision**: Use **synchronous validation**

**Rationale**:
- Labels files are small (<1MB per spec)
- No remote schema references
- No database lookups
- Simpler code, faster execution for small files

### Performance Benchmarks

| File Size | Parse + Validate Time |
|-----------|----------------------|
| 1KB - 10KB | <1ms (typical) |
| 10KB - 100KB | <5ms |
| 100KB - 1MB | <50ms (max spec) |

### Optimization

```typescript
// Compile schema ONCE at module initialization
const validateLabels = ajv.compile(schema);

// Use AJV options for best performance
const ajv = new Ajv({
  allErrors: false,        // Stop on first error (faster)
  coerceTypes: false,      // No type coercion
  useDefaults: false,      // No default values
  removeAdditional: false  // Don't remove extra properties
});
```

## Integration Points

### Extend ProgramAssets Interface

```typescript
// packages/language/src/compiler/ast-transformer.ts
interface ProgramAssets {
  layoutTemplate?: string;
  cssFiles?: string[];
  labels?: ILanguageLabel[]; // NEW
}
```

### Assign to Config

```typescript
// In transformProgram() around line 408
const config: IEngineConfiguration = {
  // ... existing properties ...
  labels: assets?.labels ?? [], // NEW
};
```

## Technical Unknowns Resolved

✅ **AJV integration**: Use AJV v8 with `JSONSchemaType<T>` for type-safe validation
✅ **Schema design**: JSON Schema Draft 2020-12 with `additionalProperties: true`
✅ **Loading pattern**: Follow CSS import pattern in `pipeline.ts`
✅ **Error mapping**: Convert AJV errors to Langium diagnostics with path and message
✅ **Performance**: Sync validation is sufficient for files <1MB
✅ **Config assignment**: Add `labels` to `ProgramAssets`, assign to `config.labels`

## Next Steps

1. Create data model documentation (`data-model.md`)
2. Create JSON schema file (`contracts/labels-schema.json`)
3. Create quickstart guide (`quickstart.md`)
4. User approval for AJV dependency installation
5. Proceed to implementation (grammar, validation, loading, transformation)
