# Implementation Plan: Typed Labels Validation

**Branch**: `034-typed-labels-the` | **Date**: 2025-11-17 | **Spec**: [spec.md](./spec.md)

## Summary

Create a Typir CustomKind type factory for label IDs that validates label ID references in operation parameters marked with `ParameterType:labelId`. Enables compile-time validation with Levenshtein-based suggestions for typos. Follows existing patterns from ImportType and CSS validation.

## Technical Context

**Language/Version**: TypeScript 5.x (existing)  
**Primary Dependencies**: Typir (existing), Typir-Langium (existing), Langium (existing)  
**Storage**: Label ID registry (in-memory, similar to CSS registry)  
**Testing**: Vitest (existing)  
**Target Platform**: Node.js 24.x ESM  
**Project Type**: Language server + compiler  
**Performance Goals**: <500ms validation update on labels file change, <200ms hover response  
**Constraints**: Levenshtein distance ≤2 for suggestions, 100% detection of invalid label IDs  
**Scale/Scope**: Support 100+ label IDs per document, validate arrays of label IDs

## Constitution Check

- [x] **Simplicity & Documentation**: Reuses existing patterns (ImportType, CSS validation, Levenshtein)
- [x] **Comprehensive Testing**: Unit + integration tests planned
- [x] **No Gold-Plating**: Solves real need - prevents runtime label errors
- [x] **Code Review**: Standard PR process
- [x] **UX Consistency**: Error messages follow CSS validation pattern
- [x] **Functional Programming**: Typir factories are pure, registry uses immutable maps

## Project Structure

### Documentation (this feature)

```
specs/034-typed-labels-the/
├── plan.md              # This file
├── research.md          # Phase 0: Typir CustomKind patterns
├── data-model.md        # Phase 1: LabelIDType properties
├── quickstart.md        # Phase 1: Developer guide
├── contracts/           # Phase 1: Type interfaces
└── tasks.md             # Phase 2: NOT created by /speckit.plan
```

### Source Code

```
packages/language/src/
├── type-system-typir/
│   ├── types/
│   │   └── label-id-type.ts              # NEW: LabelID CustomKind
│   ├── inference/
│   │   └── label-id-inference.ts         # NEW: Inference rules
│   ├── validation/
│   │   └── label-id-validation.ts        # NEW: Validation rules
│   └── utils/
│       └── label-registry.ts             # NEW: Registry service
├── eligian-validator.ts                  # MODIFY: Add validation
├── eligian-hover-provider.ts             # MODIFY: Add hover
└── __tests__/
    ├── type-system-typir/
    │   ├── label-id-type.spec.ts         # NEW
    │   ├── label-id-inference.spec.ts    # NEW
    │   └── label-id-validation.spec.ts   # NEW
    └── label-id-integration/
        ├── label-id-hover.spec.ts        # NEW
        └── label-id-diagnostics.spec.ts  # NEW
```

**Structure Decision**: Extends existing Typir type system using established patterns. No new packages required.

## Complexity Tracking

*No violations - all checks passed.*

## Phase 0: Research

**Goal**: Understand Typir CustomKind API, label registry pattern, parameter type inference.

**Tasks**:
1. Analyze ImportType implementation pattern
2. Review CSS registry for label ID registry design
3. Consult Typir docs for CustomKind API
4. Identify operations with ParameterType:labelId
5. Review Levenshtein utility

**Output**: `research.md`

## Phase 1: Design

**Goal**: Define LabelIDType structure, registry API, integration points.

**Tasks**:
1. **Data Model** (`data-model.md`):
   - LabelIDType properties: labelGroupId, translationCount, languageCodes
   - Registry schema: documentUri → LabelGroupMetadata[]

2. **Contracts** (`contracts/`):
   - LabelIDTypeProperties interface
   - LabelRegistryService interface
   - LabelGroupMetadata interface

3. **Quickstart** (`quickstart.md`):
   - Developer guide for using LabelIDType
   - Registry query examples
   - Hover formatting examples

**Output**: Design artifacts

## Next Steps

1. Run `/speckit.tasks` to generate implementation checklist
2. Implement phases 2-7 per tasks.md
3. Follow incremental commits (Constitution XXIII)

---

**Status**: Planning complete, ready for /speckit.tasks
