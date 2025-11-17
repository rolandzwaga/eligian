# Developer Quickstart: Typed Labels Validation

**Feature**: 034-typed-labels-the  
**Audience**: Developers implementing or extending label ID validation

## Overview

This feature adds Typir-based type validation for label ID references in operation parameters marked with `ParameterType:labelId`. It provides compile-time validation, hover information, and Levenshtein-based suggestions for typos.

## Architecture At-A-Glance

```
Label ID Validation Flow:

1. Labels JSON Import
   labels "./labels.json" → Parse → Extract metadata → Registry

2. Type Inference
   requestLabelData("welcome-title") → Check ParameterType:labelId → Infer LabelID<welcome-title>

3. Validation
   Query registry → Label exists? → Valid / Invalid + suggestions

4. Hover
   Hover over "welcome-title" → Query registry → Format metadata → Display
```

## Key Components

### 1. LabelID Type Factory

**File**: `packages/language/src/type-system-typir/types/label-id-type.ts`

**Usage**:
```typescript
import { createLabelIDTypeFactory } from './types/label-id-type.js';

// In EligianTypeSystem setup:
const labelIDType = createLabelIDTypeFactory(typir);
```

**Properties**:
- `labelGroupId`: Label ID string
- `translationCount`: Number of translations
- `languageCodes`: Array of language codes

### 2. Label Registry Service

**File**: `packages/language/src/type-system-typir/utils/label-registry.ts`

**Registration Example**:
```typescript
import { LabelRegistryService } from './utils/label-registry.js';

// Initialize (in module setup)
const registry = new LabelRegistryService();

// Update labels file (on parse)
registry.updateLabelsFile('file:///labels.json', [
  {id: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL']},
  {id: 'button-text', translationCount: 2, languageCodes: ['en-US', 'nl-NL']}
]);

// Register document import
registry.registerImports('file:///program.eligian', 'file:///labels.json');
```

**Query Example**:
```typescript
// Check if label exists
const exists = registry.hasLabelID('file:///program.eligian', 'welcome-title');

// Get metadata
const metadata = registry.findLabelMetadata('file:///program.eligian', 'welcome-title');
// Returns: {id: 'welcome-title', translationCount: 2, languageCodes: [...]}

// Get all label IDs
const labelIDs = registry.getLabelIDsForDocument('file:///program.eligian');
// Returns: Set(['welcome-title', 'button-text'])
```

### 3. Type Inference

**File**: `packages/language/src/type-system-typir/inference/label-id-inference.ts`

**Pattern**:
```typescript
// Check operation parameter metadata
const parameterType = getParameterType(param);
if (parameterType === 'ParameterType:labelId') {
  // Infer LabelID type
  const labelId = extractLabelIDFromParameter(param);
  const metadata = registry.findLabelMetadata(documentUri, labelId);
  
  if (metadata) {
    return labelIDType.create({
      labelGroupId: metadata.id,
      translationCount: metadata.translationCount,
      languageCodes: metadata.languageCodes
    });
  }
}
```

### 4. Validation

**File**: `packages/language/src/type-system-typir/validation/label-id-validation.ts`

**Pattern**:
```typescript
import { suggestSimilar } from '../../css/levenshtein.js';

function validateLabelID(documentUri: string, labelId: string): ValidationError | undefined {
  // Check if exists
  if (registry.hasLabelID(documentUri, labelId)) {
    return undefined;  // Valid
  }

  // Generate suggestions
  const available = Array.from(registry.getLabelIDsForDocument(documentUri));
  const suggestions = suggestSimilar(labelId, available, 2);

  return {
    code: 'unknown_label_id',
    message: `Unknown label ID: '${labelId}'`,
    hint: suggestions.length > 0 
      ? `Did you mean: '${suggestions[0]}'?`
      : 'Check imported labels file for available IDs'
  };
}
```

### 5. Hover Information

**File**: `packages/language/src/eligian-hover-provider.ts`

**Pattern**:
```typescript
// Format label metadata for hover
function formatLabelIDHover(metadata: LabelGroupMetadata): string {
  return `LabelID<${metadata.id}>

Translations: ${metadata.translationCount}
Languages: ${metadata.languageCodes.join(', ')}`;
}
```

## Common Tasks

### Adding Support for New Operation

If a new operation uses `ParameterType:labelId`:

1. **No code changes needed** - inference rules automatically detect the parameter type
2. **Verify operation metadata** has correct `@type=ParameterType:labelId` annotation
3. **Test validation** with valid/invalid label IDs

### Extending Hover Information

To add more details to hover tooltips:

1. Update `LabelGroupMetadata` interface with new fields
2. Extract new fields in labels JSON parser
3. Update hover formatting in `formatLabelIDHover()`

### Debugging Registry Issues

```typescript
// Check if document has labels import
const labelIDs = registry.getLabelIDsForDocument(documentUri);
console.log('Available label IDs:', Array.from(labelIDs));

// Check specific label
const metadata = registry.findLabelMetadata(documentUri, 'welcome-title');
console.log('Label metadata:', metadata);

// Check file linkage
// (Internal API - may need to add getter)
```

## Testing Strategy

### Unit Tests

**Label Registry**:
```typescript
test('registry stores and retrieves label metadata', () => {
  registry.updateLabelsFile('file:///labels.json', [
    {id: 'test-label', translationCount: 1, languageCodes: ['en-US']}
  ]);
  
  registry.registerImports('file:///test.eligian', 'file:///labels.json');
  
  expect(registry.hasLabelID('file:///test.eligian', 'test-label')).toBe(true);
});
```

**Type Inference**:
```typescript
test('infers LabelID type for ParameterType:labelId', () => {
  const type = inferTypeForParameter(param, documentUri);
  expect(type.typeName).toBe('LabelID<test-label>');
});
```

**Validation**:
```typescript
test('reports error for unknown label ID with suggestion', () => {
  const error = validateLabelID(documentUri, 'test-labell');  // typo
  expect(error.code).toBe('unknown_label_id');
  expect(error.hint).toContain('test-label');
});
```

### Integration Tests

**End-to-End Validation**:
```typescript
test('validates label ID in operation call', async () => {
  const program = `
    labels "./labels.json"
    timeline "Test" at 0s {
      at 0s requestLabelData("invalid-id")
    }
  `;
  
  const {errors} = await parseAndValidate(program);
  expect(errors).toHaveLength(1);
  expect(errors[0].code).toBe('unknown_label_id');
});
```

**Hover Integration**:
```typescript
test('displays label metadata on hover', async () => {
  const hover = await getHover(documentUri, positionOverLabelID);
  expect(hover.contents).toContain('LabelID<welcome-title>');
  expect(hover.contents).toContain('Translations: 2');
});
```

## References

- **Typir Documentation**: `f:/projects/typir/` (local clone)
- **ImportType Pattern**: `packages/language/src/type-system-typir/types/import-type.ts`
- **CSS Registry Pattern**: `packages/language/src/css/css-registry.ts`
- **Levenshtein Utility**: `packages/language/src/css/levenshtein.ts`
- **Test Helpers**: `packages/language/src/__tests__/test-helpers.ts`

---

**Next**: Run `/speckit.tasks` to generate implementation task list
