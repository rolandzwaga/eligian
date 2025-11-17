# Research: Typed Labels Validation

**Date**: 2025-11-17  
**Feature**: 034-typed-labels-the

## Research Questions

1. How does Typir CustomKind API work for creating custom type factories?
2. How should label ID registry follow CSS registry pattern?
3. What operations use ParameterType:labelId?
4. How to integrate with existing type inference system?

## Findings

### 1. Typir CustomKind API Pattern

**Source**: `packages/language/src/type-system-typir/types/import-type.ts`

**Pattern**:
```typescript
export function createLabelIDTypeFactory(
  typir: TypirLangiumServices<EligianSpecifics>
): CustomKind<LabelIDTypeProperties, EligianSpecifics> {
  return new CustomKind<LabelIDTypeProperties, EligianSpecifics>(typir, {
    name: 'LabelID',
    calculateTypeName: (props) => `LabelID<${props.labelGroupId}>`,
    calculateTypeIdentifier: (props) => `LabelID<${props.labelGroupId}>:${props.translationCount}`,
  });
}
```

**Properties Interface**:
```typescript
export interface LabelIDTypeProperties {
  labelGroupId: string;
  translationCount: number;
  languageCodes: string[];
  [key: string]: string | number | string[];  // Typir requirement
}
```

**Decision**: Follow ImportType pattern exactly - proven, well-tested approach.

### 2. Label ID Registry Pattern

**Source**: `packages/language/src/css/css-registry.ts` (CSS Registry)

**Pattern**:
- Centralized service (`LabelRegistryService`)
- Document-based tracking: `Map<documentUri, Set<LabelGroupMetadata>>`
- Update methods: `updateLabelsFile()`, `registerImports()`, `clearDocument()`
- Query methods: `getLabelIDsForDocument()`, `findLabelMetadata()`

**Decision**: Mirror CSS registry exactly - same API surface, same patterns.

### 3. Operations with ParameterType:labelId

**Source**: Eligius library (`../eligius/src/controllers/`)

**Operations**:
1. `requestLabelData` - Single label ID parameter
   - Parameter: `labelId: string` with `@type=ParameterType:labelId`
   
2. `loadLottieAnimation` - Array of label IDs
   - Parameter: `labelIds: string[]` with `@itemType=ParameterType:labelId`

**Decision**: Support both single and array parameters. Array validation validates each element individually.

### 4. Type Inference Integration

**Source**: `packages/language/src/type-system-typir/inference/`

**Approach**:
- Create `label-id-inference.ts` with inference rule for operation parameters
- Check operation metadata for `ParameterType:labelId` annotation
- Infer LabelID type for matching parameters
- Handle array parameters by inferring element type

**Decision**: Follow existing parameter type inference pattern from operation metadata.

### 5. Levenshtein Utility Reuse

**Source**: `packages/language/src/css/levenshtein.ts`

**API**:
```typescript
export function levenshteinDistance(a: string, b: string): number
export function suggestSimilar(input: string, candidates: string[], threshold: number = 2): string[]
```

**Decision**: Reuse existing utility as-is. Already tested, proven effective for CSS class suggestions.

## Technical Approach

### Architecture

```
LabelID Type System
├── Type Factory (label-id-type.ts)
│   └── Creates LabelID<id> types with metadata
├── Registry Service (label-registry.ts)
│   ├── Tracks label IDs per document
│   ├── Updates on labels file changes
│   └── Provides query API
├── Inference Rules (label-id-inference.ts)
│   ├── Infers type from ParameterType:labelId
│   └── Handles array parameters
├── Validation Rules (label-id-validation.ts)
│   ├── Validates label ID exists in registry
│   ├── Generates Levenshtein suggestions
│   └── Reports errors with context
└── Integration
    ├── Validator: calls validation rules
    └── Hover: formats label metadata
```

### Implementation Strategy

1. **Phase 2**: Create LabelID type factory (similar to ImportType)
2. **Phase 3**: Create label registry service (mirror CSS registry)
3. **Phase 4**: Add inference rules for ParameterType:labelId
4. **Phase 5**: Add validation rules with Levenshtein suggestions
5. **Phase 6**: Integrate with validator and hover provider
6. **Phase 7**: Comprehensive testing (unit + integration)

### Risks & Mitigations

**Risk**: Feature 033 (label imports) may not have registry/watcher implemented yet
**Mitigation**: Check Feature 033 implementation status. If missing, implement minimal registry. File watcher can be added later for hot-reload.

**Risk**: Array parameter validation complexity
**Mitigation**: Validate each array element individually. Existing Typir infrastructure handles array types.

## Alternatives Considered

### Alternative 1: Validator-only (no Typir)
**Rejected**: Would duplicate validation logic. Typir provides type-safe inference, hover integration, and consistency with other type validations.

### Alternative 2: Shared registry with CSS
**Rejected**: Label IDs and CSS classes have different semantics and lifecycles. Separate registries maintain clarity.

### Alternative 3: No Levenshtein suggestions
**Rejected**: User experience requirement (SC-003). Suggestions are critical for typo detection.

## References

- ImportType implementation: `packages/language/src/type-system-typir/types/import-type.ts`
- CSS Registry: `packages/language/src/css/css-registry.ts`
- Levenshtein utility: `packages/language/src/css/levenshtein.ts`
- Operation metadata: `packages/language/src/completion/metadata/operations.generated.ts`
- Typir documentation: `f:/projects/typir/` (local reference)

---

**Status**: Research complete. Proceed to Phase 1 (Design).
