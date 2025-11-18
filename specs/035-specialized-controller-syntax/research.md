# Research Findings: Specialized Controller Syntax

**Feature**: 035-specialized-controller-syntax
**Date**: 2025-11-17
**Status**: Phase 0 Complete

## Overview

This document consolidates research findings for implementing the `addController` syntax that supports ALL Eligius controllers with parameter validation based on ctrlmetadata.

---

## 1. Controller Metadata Structure (ctrlmetadata)

### Decision: Use Eligius ctrlmetadata Export Pattern

**Rationale**: Eligius exports `ctrlmetadata` in the same pattern as `metadata` and `eventmetadata`, which are already successfully processed by the language package.

**Source**: `f:/projects/eligius/eligius/src/index.ts:8`
```typescript
export * as ctrlmetadata from './controllers/metadata/index.ts';
```

**Metadata Location**: `f:/projects/eligius/eligius/src/controllers/metadata/`

### Available Controllers (8 Total)

From `ctrlmetadata/index.ts`, the following controllers are exported:

1. **DOMEventListenerController** - DOM event listener attachment
2. **LabelController** - Label text rendering with i18n support
3. **LottieController** - Lottie animation rendering
4. **MutationObserverController** - DOM mutation observation
5. **NavigationController** - Navigation state management
6. **ProgressbarController** - Progress bar rendering
7. **RoutingController** - Routing state management
8. **SubtitlesController** - Subtitle rendering

### Metadata Structure Pattern

All controller metadata follows the `IControllerMetadata<T>` interface:

```typescript
// Source: f:/projects/eligius/eligius/src/controllers/metadata/types.ts
export type IControllerMetadata<T> = {
  description: string;
  dependentProperties?: (keyof T)[];
  properties?: Partial<Record<keyof T, TPropertyMetadata>>;
};
```

**Key Properties**:
- `description`: Human-readable controller description
- `dependentProperties`: Array of parameter names that are dependencies (like `selectedElement`)
- `properties`: Record of parameter metadata with type and required flags

### Parameter Type Examples

From examined controller metadata files:

**LabelController** (`label-controller.ts`):
```typescript
properties: {
  labelId: {
    type: 'ParameterType:labelId',  // ⭐ Special type - requires Feature 034 validation
    required: true,
  },
  attributeName: {
    type: 'ParameterType:string',
  },
}
```

**NavigationController** (`navigation-controller.ts`):
```typescript
properties: {
  json: {
    type: 'ParameterType:object',
    required: true,
  },
}
```

**LottieController** (`lottie-controller.ts`):
```typescript
properties: {
  url: {
    type: 'ParameterType:url',
    required: true,
  },
}
```

**SubtitlesController** (`subtitles-controller.ts`):
```typescript
properties: {
  language: {
    type: 'ParameterType:string',
  },
  subtitleData: {
    type: 'ParameterType:array',
  },
}
```

### Parameter Type Catalog

Discovered parameter types across all controllers:
- `ParameterType:labelId` - Label ID reference (special validation via Feature 034)
- `ParameterType:string` - String values
- `ParameterType:object` - Object literals
- `ParameterType:array` - Array values
- `ParameterType:url` - URL strings
- `ParameterType:number` - Numeric values (assumed, not yet verified)
- `ParameterType:boolean` - Boolean values (assumed, not yet verified)

**Note**: Need to verify complete type catalog by examining `f:/projects/eligius/eligius/src/operation/metadata/types.ts` (TPropertyMetadata definition).

---

## 2. Existing Metadata Processing Pattern

### Decision: Reuse metadata/eventmetadata Generation Pattern

**Rationale**: The language package already has a proven metadata generation script that imports from Eligius and generates TypeScript modules.

**Source**: `packages/language/src/completion/generate-metadata.ts`

### Current Pattern (for operations and events)

**Script Workflow**:
1. Import `metadata` and `eventmetadata` from `eligius` npm package (line 13)
2. Loop through exported metadata functions
3. Call each function to get metadata object
4. Extract properties, dependencies, outputs
5. Generate TypeScript module with interfaces and constants

**Generated Files**:
- `packages/language/src/completion/metadata/operations.generated.ts` - 226 lines
- `packages/language/src/completion/metadata/timeline-events.generated.ts` - 463 lines

**Example Generated Structure** (timeline-events.generated.ts):
```typescript
export interface EventArgMetadata {
  name: string;
  type: string;
}

export interface TimelineEventMetadata {
  name: string;
  description: string;
  category?: string;
  args?: EventArgMetadata[];
}

export const TIMELINE_EVENTS: TimelineEventMetadata[] = [ /* 43 events */ ];
```

### Adaptation for ctrlmetadata

**Required Changes**:
1. Add `ctrlmetadata` import to line 13: `import { eventmetadata, metadata, ctrlmetadata } from 'eligius';`
2. Add `generateControllersMetadata()` function similar to `generateTimelineEventsMetadata()` (lines 155-212)
3. Generate `packages/language/src/completion/metadata/controllers.generated.ts`
4. Export controller interfaces and `CONTROLLERS` constant array

**Expected Output Structure**:
```typescript
export interface ControllerParameterMetadata {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

export interface ControllerMetadata {
  name: string;
  description: string;
  parameters: ControllerParameterMetadata[];
  dependencies: string[];
}

export const CONTROLLERS: ControllerMetadata[] = [ /* 8 controllers */ ];
```

**Alternatives Considered**:
- ❌ Manual metadata definition - error-prone, requires manual sync with Eligius updates
- ❌ Runtime metadata fetching - adds complexity, slower, doesn't work in LSP context
- ✅ **Code generation from Eligius exports** - proven pattern, compile-time safety, zero runtime overhead

---

## 3. Grammar and AST Design

### Decision: AddController Operation Call (Variadic Arguments)

**Rationale**: The `addController` syntax is a specialized operation call that accepts variable arguments based on the controller name (first argument).

**Proposed Grammar Addition** (eligian.langium):
```langium
OperationCall:
  systemName=ID '(' (args+=Expression (',' args+=Expression)*)? ')';
```

**Note**: Existing `OperationCall` grammar already supports variadic arguments. No grammar changes needed - validation handles controller-specific parameter checking.

**AST Transformation Strategy**:
- Parse `addController('LabelController', "mainTitle")` as OperationCall
- Validator checks if systemName is a known controller (from CONTROLLERS array)
- If controller: validate parameter count and types against controller metadata
- Transformer expands to two operations:
  1. `getControllerInstance` with `{systemName: 'LabelController'}`
  2. `addControllerToElement` with `{labelId: 'mainTitle'}`

**Alternatives Considered**:
- ❌ Dedicated AddControllerStatement grammar rule - overcomplicates grammar for simple operation call
- ❌ Action-based approach - controllers are operations, not custom actions
- ✅ **Operation call with specialized validation** - reuses existing grammar, validation layer handles complexity

---

## 4. Validation Strategy

### Decision: Multi-Layer Validation (Controller + Parameter Type)

**Rationale**: Validation must check controller existence, parameter count, parameter types, and special types like labelId.

**Validation Layers**:

#### Layer 1: Controller Name Validation
- Check if first argument (controller name) is in `CONTROLLERS` array
- Provide Levenshtein suggestions for typos (reuse existing pattern from Feature 034)
- Error if controller not recognized

#### Layer 2: Parameter Count Validation
- Extract `required` parameters from controller metadata
- Count provided arguments (excluding controller name)
- Error if too few (missing required) or too many (extra arguments)

#### Layer 3: Parameter Type Validation
- Match each argument position to controller parameter
- Validate argument expression type matches parameter type
- For basic types (string, number, object, array): use existing type inference
- For special types (labelId): delegate to type-specific validators

#### Layer 4: Special Type Validation (labelId)
- If parameter type is `ParameterType:labelId`, invoke Feature 034 infrastructure
- Use `LabelRegistryService.validateLabelID()` (existing method)
- Apply Levenshtein distance suggestions for typos (existing utility)

**Implementation Location**: `packages/language/src/eligian-validator.ts`

**New Validator Method**:
```typescript
checkControllerAddition(call: OperationCall, accept: ValidationAcceptor): void
```

**Alternatives Considered**:
- ❌ Single-pass validation - harder to provide clear error messages for different failure modes
- ❌ Runtime validation only - defeats purpose of compile-time safety
- ✅ **Multi-layer validation** - clear separation of concerns, better error messages, reuses existing infrastructure

---

## 5. Label ID Type Validation Integration

### Decision: Reuse Feature 034 Infrastructure (LabelRegistryService)

**Rationale**: Feature 034 already provides complete label ID validation infrastructure including registry, validation methods, and Levenshtein suggestions.

**Existing Infrastructure** (from Feature 034):
- **LabelRegistryService** (`packages/language/src/labels/label-registry.ts`)
  - `registerImports(documentUri, labelFiles)` - Register label imports
  - `getLabelsForDocument(documentUri)` - Get available label IDs
  - `validateLabelID(documentUri, labelId)` - Validate label ID exists
  - `findLabelLocation(documentUri, labelId)` - Get label definition location

- **Levenshtein Distance** (`packages/language/src/css/levenshtein.ts`)
  - `levenshteinDistance(a, b)` - Compute edit distance
  - `findClosestMatches(input, candidates, threshold)` - Find suggestions

**Integration Pattern**:
```typescript
// In checkControllerAddition() validator
if (parameterType === 'ParameterType:labelId') {
  const labelId = extractStringLiteral(argument);
  const documentUri = getDocument(call).$uri;

  // Reuse Feature 034 validation
  if (!labelRegistry.validateLabelID(documentUri, labelId)) {
    const suggestions = labelRegistry.getSuggestions(documentUri, labelId);
    accept('error', `Unknown label ID: '${labelId}'${suggestions}`, { node: argument });
  }
}
```

**Dependency Verification**: Feature 034 complete and merged (per conversation context).

**Alternatives Considered**:
- ❌ Re-implement label validation - duplicates existing work
- ❌ Skip label validation for MVP - loses key value proposition
- ✅ **Reuse Feature 034 infrastructure** - zero duplication, proven implementation, consistent UX

---

## 6. Transformation Strategy

### Decision: Expand to getControllerInstance + addControllerToElement

**Rationale**: The user explicitly requested this transformation in the feature description. It maintains compatibility with existing Eligius JSON structure.

**Transformation Logic** (ast-transformer.ts):

**Input DSL**:
```eligian
addController('LabelController', "mainTitle")
```

**Output JSON**:
```json
[
  {
    "systemName": "getControllerInstance",
    "operationData": {
      "systemName": "LabelController"
    }
  },
  {
    "systemName": "addControllerToElement",
    "operationData": {
      "labelId": "mainTitle"
    }
  }
]
```

**Implementation Details**:
1. Detect operation call with systemName matching controller name (from CONTROLLERS)
2. Extract controller name (first argument)
3. Extract controller parameters (remaining arguments)
4. Generate two operations in sequence:
   - First: `getControllerInstance` with controller systemName
   - Second: `addControllerToElement` with parameters object
5. Map parameter arguments to parameter names from metadata

**Parameter Mapping**:
- Use controller metadata `properties` order to map positional arguments to named parameters
- Example: `addController('SubtitlesController', "en", subtitleArray)`
  - Arg 1 (`"en"`) → `language` parameter
  - Arg 2 (`subtitleArray`) → `subtitleData` parameter

**Alternatives Considered**:
- ❌ Generate single custom operation - requires Eligius changes
- ❌ Keep `addController` in JSON output - not compatible with Eligius runtime
- ✅ **Expand to two-operation sequence** - matches user request, zero runtime changes, backwards compatible

---

## 7. IDE Support Strategy

### Decision: Autocomplete and Hover via Completion/Hover Providers

**Rationale**: VS Code extension already has completion and hover providers. Extend them to recognize controller operations.

**Implementation Locations**:
- `packages/language/src/eligian-completion-provider.ts` - Autocomplete
- `packages/language/src/eligian-hover-provider.ts` - Hover tooltips

**Autocomplete Features** (P3):
1. **Controller Name Suggestions**:
   - Trigger: typing `addController('` or cursor in first argument
   - Show: All controller names from CONTROLLERS array
   - Display: Controller name + description from metadata

2. **Parameter Suggestions**:
   - Trigger: cursor in subsequent argument positions
   - Show: Parameter-specific suggestions based on type
   - For labelId: show available label IDs from LabelRegistryService
   - For other types: show type hint only

**Hover Features** (P3):
1. **Controller Name Hover**:
   - Show: Controller description, required parameters, parameter types
   - Format: Markdown with parameter table

2. **Parameter Hover**:
   - Show: Parameter name, type, description (if available)
   - For labelId: show label metadata (translation count, languages)

**Performance Target**: <300ms response (per SC-005)

**Alternatives Considered**:
- ❌ No IDE support - poor developer experience
- ❌ Separate LSP commands - overcomplicates user interaction
- ✅ **Extend existing providers** - consistent UX, reuses infrastructure, meets performance targets

---

## 8. Testing Strategy

### Decision: Multi-Layer Test Coverage (Unit + Integration)

**Rationale**: Comprehensive testing required per Constitution Principle II (80% coverage minimum).

**Test Layers**:

#### Unit Tests (packages/language/src/__tests__/)

1. **Metadata Generation** (`generate-metadata.spec.ts`):
   - Test ctrlmetadata import from Eligius
   - Verify CONTROLLERS array generation
   - Validate controller metadata structure

2. **Validation Tests** (`controller-validation.spec.ts`):
   - Unknown controller name errors
   - Parameter count mismatch errors (too few, too many)
   - Parameter type mismatch errors
   - Label ID validation errors (Feature 034 integration)
   - Levenshtein suggestions for controller typos
   - Levenshtein suggestions for label ID typos

3. **Transformation Tests** (`controller-transformation.spec.ts`):
   - Verify getControllerInstance operation generation
   - Verify addControllerToElement operation generation
   - Verify parameter mapping (positional → named)
   - Test all 8 controller types

#### Integration Tests

1. **End-to-End Compilation**:
   - Parse `addController` DSL → validate → transform → JSON output
   - Snapshot testing for expected JSON structure
   - Test with all controller types

2. **IDE Support Tests** (P3):
   - Autocomplete triggers and suggestions
   - Hover content formatting
   - Performance benchmarks (<300ms)

**Test Fixtures**:
- Valid controller additions (all 8 types)
- Invalid controller names
- Parameter count errors
- Label ID validation scenarios

**Coverage Target**: 80%+ (per Constitution Principle II)

**Alternatives Considered**:
- ❌ Manual testing only - not sustainable, no regression protection
- ❌ Integration tests only - harder to debug, slower feedback
- ✅ **Unit + Integration tests** - fast feedback, comprehensive coverage, aligns with constitution

---

## 9. Dependencies and Prerequisites

### External Dependencies
- **Eligius npm package** - Must export `ctrlmetadata` (verified: exists in v0.x.x)
- **Feature 034 infrastructure** - LabelRegistryService, Levenshtein utilities (verified: complete and merged)

### Internal Dependencies
- **Existing metadata generation** - Pattern to reuse (verified: operational)
- **Operation validation** - Existing OperationCall validators (verified: operational)
- **AST transformation** - Existing transformer infrastructure (verified: operational)

### Technical Constraints
- **TypeScript ESM** - NodeNext module resolution with .js extensions (per Constitution Principle IX)
- **Test-first development** - RED-GREEN-REFACTOR cycle (per Constitution Principle II)
- **Biome formatting** - All code must pass `pnpm run check` (per Constitution Principle XI)
- **Backwards compatibility** - Existing operation-based controller syntax must continue working (per FR-012)

---

## 10. Open Questions and Risks

### Open Questions
1. ✅ **Resolved**: Do all controllers follow the same metadata pattern? **Answer**: Yes, verified via IControllerMetadata<T> interface
2. ✅ **Resolved**: Is ctrlmetadata available in Eligius? **Answer**: Yes, exported at `eligius/src/index.ts:8`
3. ⚠️ **TODO**: What is the complete ParameterType catalog? **Action**: Examine `eligius/src/operation/metadata/types.ts` for TPropertyMetadata
4. ⚠️ **TODO**: How are dependent properties (like selectedElement) handled? **Action**: Research how getControllerInstance populates dependencies

### Risks and Mitigations

**Risk**: Parameter type validation complexity (different validators per type)
**Mitigation**: Start with basic type checking, enhance incrementally. Label ID validation already proven via Feature 034.

**Risk**: Parameter order ambiguity (positional vs named)
**Mitigation**: Use metadata `properties` object key order (TypeScript preserves insertion order). Document in quickstart.md.

**Risk**: Breaking changes if Eligius ctrlmetadata structure changes
**Mitigation**: Code generation script will fail at build time, forcing updates. Add version check to generate-metadata.ts.

**Risk**: Performance degradation with many controllers
**Mitigation**: Generated metadata is compile-time constants (no runtime lookup). <300ms target easily achievable.

---

## 11. Next Steps (Phase 1 - Design)

Based on research findings, proceed to Phase 1 design artifacts:

1. **data-model.md**: Define ControllerMetadata entity, parameter mapping, validation rules
2. **contracts/**: API contracts for validator, transformer, completion provider
3. **quickstart.md**: Usage examples for all 8 controllers, error scenarios, migration guide

After design completion, update agent context and run constitution compliance check.

---

## References

- Feature Spec: `specs/035-specialized-controller-syntax/spec.md`
- Constitution: `.specify/memory/constitution.md` (v2.3.0)
- Eligius ctrlmetadata: `f:/projects/eligius/eligius/src/controllers/metadata/`
- Existing metadata generator: `packages/language/src/completion/generate-metadata.ts`
- Feature 034 (Label Validation): `specs/034-typed-labels-the/`
- Test helpers: `packages/language/src/__tests__/test-helpers.ts`
