# Implementation Plan: Enhanced Typir Integration for IDE Support

**Branch**: `021-enhanced-typir-integration` | **Date**: 2025-10-30 | **Spec**: [spec.md](spec.md)

## Summary

Extend Typir integration to include **import statements**, **constants**, **timeline events**, **control flow**, and **timeline configurations**. Creates custom Typir types (ImportType, TimelineEventType, TimelineType) with inference/validation rules for richer IDE support.

**Research**: See [TYPIR_INTEGRATION_RESEARCH.md](../../TYPIR_INTEGRATION_RESEARCH.md) for comprehensive analysis.

## Technical Context

**Language**: TypeScript 5.7+ (NodeNext ESM)  
**Dependencies**: Typir 1.0+, Typir-Langium 1.0+, Langium 3.0+, Vitest 2.0+  
**Storage**: N/A (in-memory type system)  
**Testing**: Vitest, 80% coverage, integration tests isolated  
**Platform**: Node 18+ ESM, VS Code extension  
**Project**: Language server monorepo (packages/language, compiler, extension)  
**Performance**: <50ms validation (500 lines), <200ms (2000 lines)  
**Constraints**: Optional params blocked, <10MB memory, 1323+ tests pass  
**Scope**: 5 user stories, 37 FRs, 26 SCs, 100+ new tests

## Constitution Check ✅

- [x] **Simplicity**: Clear Typir CustomKind approach from research
- [x] **Testing**: 100+ tests planned (TDD, RED-GREEN-REFACTOR)
- [x] **No Gold-Plating**: Solves documented pain points only
- [x] **Code Review**: PR process defined in migration strategy
- [x] **UX Consistency**: Same DiagnosticInfo format as Langium
- [x] **Functional Programming**: Pure inference/validation rules

All checks passed. No violations.

## Project Structure

```
packages/language/src/type-system-typir/
├── types/               # NEW: Custom types (ImportType, EventType, TimelineType)
├── inference/           # NEW: Inference rules per construct
├── validation/          # NEW: Validation rules per construct
├── utils/               # NEW: time-parser, asset-inferrer
└── eligian-type-system.ts  # UPDATED: Register new types/rules
```

## Phase 0: Research ✅

Research complete: [TYPIR_INTEGRATION_RESEARCH.md](../../TYPIR_INTEGRATION_RESEARCH.md)

Key findings:
- CustomKind API for structured types
- Inference rules via `typir.Inference.addInferenceRulesForAstNodes`
- Validation rules via `typir.validation.Collector.addValidationRulesForAstNodes`
- LOX example patterns for implementation
- Performance: O(n) inference, O(n×r) validation

## Phase 1: Design & Contracts

See generated files:
- [data-model.md](data-model.md) - Entity definitions (5 entities)
- [contracts/typir-types.ts](contracts/typir-types.ts) - Type definitions
- [quickstart.md](quickstart.md) - Developer guide

### Entities Summary

1. **ImportType**: `assetType | path | isDefault`
2. **TimelineEventType**: `eventKind | startTime | endTime | duration`
3. **TimelineType**: `provider | containerSelector | source | events[]`
4. **ConstantDeclaration**: `name | inferredType | scope`
5. **ControlFlowNode**: `nodeType | conditionType | collectionType`

### Typir CustomKind vs Langium AST Nodes

**Important**: Typir custom types (ImportType, TimelineEventType, TimelineType) are **wrappers** around existing Langium AST nodes, NOT replacements.

**Relationship**:
- **Langium AST**: Grammar-defined nodes (DefaultImport, NamedImport, TimedEvent, SequenceBlock, StaggerBlock, Timeline)
- **Typir CustomKind**: Type system representations with properties for validation/hover

**Example - Import Statements**:
```typescript
// Langium AST nodes (already exist in eligian.langium)
DefaultImport {
  keyword: 'layout' | 'styles' | 'provider'
  path: string
}
NamedImport {
  name: string
  path: string
  asType?: 'html' | 'css' | 'media'
}

// Typir CustomKind (NEW - wraps AST nodes)
ImportType {
  assetType: 'html' | 'css' | 'media'  // Inferred from keyword or extension
  path: string                          // From AST node
  isDefault: boolean                    // true for DefaultImport, false for NamedImport
}
```

**Inference Flow**:
1. Langium parses source → creates DefaultImport/NamedImport AST nodes
2. Typir inference rule matches AST node (`node.$type === 'DefaultImport'`)
3. Inference rule creates ImportType with properties extracted from AST node
4. Typir validation rules check ImportType properties (duplicate defaults, type mismatches)
5. Hover shows ImportType name: "Import<css>"

**This pattern applies to all custom types in this spec**.

## Migration Strategy

**Incremental** (NOT Big Bang):
1. Keep Langium validators during transition
2. Run both validators in parallel
3. Compare results in tests
4. Remove Langium only after Typir proven stable

**Phases**:
- Phase 1 (Weeks 1-2): US1 + US2 - 35+ tests
- Phase 2 (Weeks 3-4): US3 - 30+ tests
- Phase 3 (Weeks 5-6): US4 + US5 - 35+ tests (optional)

## Next Steps

✅ Complete: plan.md, research.md (existing)  
⏳ Generate: data-model.md, contracts/, quickstart.md  
⏳ Run: update-agent-context.ps1  
⏳ Ready for: `/speckit.tasks` to generate tasks.md

