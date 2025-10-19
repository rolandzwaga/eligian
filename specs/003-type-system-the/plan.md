# Implementation Plan: Robust Type System with Typir Integration

**Branch**: `003-type-system-the` | **Date**: 2025-10-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-type-system-the/spec.md`

## Summary

Replace Eligian's custom type system implementation with **Typir**, a robust TypeScript library specifically designed for building type systems that integrate with Langium. The migration must maintain 100% backward compatibility while providing a more extensible foundation for future type system enhancements. Typir provides battle-tested implementations for type inference, validation, and error reporting, fully integrated with Langium's document lifecycle and validation infrastructure.

**Key Benefits**:
- Mature, tested type checking infrastructure (used in production Langium languages)
- Automatic integration with Langium's validation and document lifecycle
- Extensible architecture for future type system features (union types, generics, structural typing)
- Performance-optimized caching and inference

**Migration Strategy**:
- Keep existing type annotation syntax in grammar (no DSL changes)
- Replace custom type system code in `packages/language/src/type-system/` with Typir
- Preserve all error message formats and user-facing behavior
- Maintain 100% backward compatibility for existing Eligian code

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js >=20.10.0
**Primary Dependencies**:
- `typir` v0.x - Core type system library
- `typir-langium` v0.x - Langium integration binding
- `langium` 4.1.0 - Language workbench (existing)
- `effect` 3.18.4 - Functional programming library (existing)
- `eligius` 1.3.0 - Core Eligius library (existing)

**Storage**: N/A (type system is in-memory, document-based)
**Testing**: Vitest (existing test framework)
**Target Platform**: Node.js (language server) + VS Code extension (browser-compatible LSP)
**Project Type**: Langium language package (monorepo structure)
**Performance Goals**:
- Type checking overhead: < 50ms for typical files (100-200 lines)
- IDE responsiveness: Type errors appear within 500ms of typing
- Large file support: Handle 1000+ line files without degradation

**Constraints**:
- 100% backward compatibility (no breaking changes to DSL syntax or behavior)
- All 298 existing tests must pass after migration
- Error message format preservation for user familiarity
- Operation registry integration (100+ operations)

**Scale/Scope**:
- 6 primitive types (string, number, boolean, object, array, unknown)
- 100+ operation function types (from operation registry)
- ~25 type system integration tests to migrate
- ~500 LOC for type system definition

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Typir simplifies type checking by replacing custom code with library. Comprehensive documentation in research.md, data-model.md, quickstart.md.
- [x] **Comprehensive Testing**: All 25 existing type system tests will be migrated. Integration tests verify Typir behavior matches custom implementation.
- [x] **No Gold-Plating**: Solves real need - current type system works but lacks extensibility. Typir provides foundation for future features without speculative additions.
- [x] **Code Review**: Standard PR process applies. Typir integration reviewed for constitution compliance.
- [x] **UX Consistency**: Type checking is internal service - no user-facing API changes. Error messages preserved for consistency.
- [x] **Functional Programming**: Typir uses functional patterns. External immutability maintained (types are immutable from user perspective). Internal mutation allowed for performance (Typir's implementation detail).

*All checks pass. No violations to justify.*

## Project Structure

### Documentation (this feature)

```
specs/003-type-system-the/
├── spec.md              # Feature specification (user stories, requirements)
├── plan.md              # This file (implementation plan)
├── research.md          # Typir integration patterns, migration strategy
├── data-model.md        # Type graph structure, metadata, relationships
├── quickstart.md        # Quick start implementation guide
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository root)

**Monorepo Structure** (existing):

```
packages/
├── language/                    # Langium language package (PRIMARY FOCUS)
│   ├── src/
│   │   ├── eligian.langium               # Grammar (no changes)
│   │   ├── eligian-module.ts             # ADD: Typir service registration
│   │   ├── eligian-validator.ts          # REMOVE: Type checking code
│   │   ├── type-system/                  # DELETE: Custom type system
│   │   │   ├── types.ts
│   │   │   ├── inference.ts
│   │   │   ├── validator.ts
│   │   │   └── index.ts
│   │   ├── type-system-typir/            # NEW: Typir integration
│   │   │   ├── eligian-specifics.ts      # Language specifics for Typir
│   │   │   ├── eligian-type-system.ts    # Type system definition
│   │   │   └── index.ts                  # Public exports
│   │   ├── compiler/
│   │   │   └── operations/
│   │   │       └── registry.generated.ts # Operation metadata (used by Typir)
│   │   └── __tests__/
│   │       └── type-system.spec.ts       # UPDATE: Test Typir integration
│   └── package.json                      # ADD: typir, typir-langium dependencies
│
├── compiler/                    # Compiler package (no changes needed)
└── extension/                   # VS Code extension (no changes needed)
```

**Structure Decision**: Use existing monorepo structure. Type system changes are isolated to `packages/language/` package. New `type-system-typir/` directory replaces old `type-system/` directory. No changes to grammar or compiler packages required - Typir integrates at the language service level.

## Complexity Tracking

*No constitution violations. This section is empty.*

---

## Phase 0: Research (COMPLETE ✅)

**Artifacts Generated**:
- [research.md](./research.md) - Typir integration patterns, migration strategy
- [data-model.md](./data-model.md) - Type graph structure, relationships
- [quickstart.md](./quickstart.md) - Implementation guide

**Key Decisions Made**:
1. Use Typir-Langium binding for automatic Langium integration
2. Implement `LangiumTypeSystemDefinition` to separate constant types (primitives) from user-dependent types
3. Use fluent API for type creation (concise, readable)
4. Preserve `unknown` type as top type (compatible with all types) for backward compatibility
5. Integrate operation registry by creating function types for each operation

**Technical Unknowns Resolved**:
- ✅ How Typir integrates with Langium document lifecycle
- ✅ How to register inference rules for AST nodes
- ✅ How to map operation registry metadata to Typir function types
- ✅ How validation errors are reported through Langium's validation system
- ✅ Performance optimization strategies (caching, languageKey vs filter)

---

## Phase 1: Design & Contracts (COMPLETE ✅)

### Data Model

**Primary Entities**:
1. **Type** - Nodes in the type graph (primitives, functions, top type)
2. **Inference Rule** - Connects AST nodes to types
3. **Validation Rule** - Type-related checks on AST nodes
4. **Type Constraint** - Type requirements collected during inference
5. **Type Error** - Validation failures with location and hints
6. **Operation Signature** - Metadata from operation registry

**Key Relationships**:
- Type ← Inference Rule → AST Node
- Type ← Validation Rule → AST Node
- Operation Signature → Function Type (1:1 mapping)
- Document → Type[] (lifecycle association)

See [data-model.md](./data-model.md) for complete model.

### API Contracts

**No external API contracts** - Type system is an internal service. User-facing interface is:
1. DSL syntax (type annotations) - unchanged
2. Validation errors - format preserved

**Internal Service Interface** (Typir services):
```typescript
interface TypirLangiumServices<Specifics> {
  Inference: {
    inferType(node: AstNode): Type | InferenceProblem[]
    addInferenceRule(rule: InferenceRule): void
  }
  validation: {
    Collector: {
      addValidationRulesForAstNodes(rules: Record<string, ValidationRule>): void
    }
    Constraints: {
      ensureNodeIsAssignable(source, target, accept, messageFactory): void
    }
  }
  factory: {
    Primitives: { create(config): PrimitiveTypeBuilder }
    Functions: { create(config): FunctionTypeBuilder }
    Top: { create(config): TopTypeBuilder }
  }
}
```

### Implementation Quickstart

See [quickstart.md](./quickstart.md) for detailed step-by-step guide. Summary:

1. Install `typir` and `typir-langium` packages
2. Create `EligianSpecifics` type definition
3. Implement `EligianTypeSystem` class with `onInitialize()` and `onNewAstNode()`
4. Register Typir service in Langium module
5. Implement primitive type inference
6. Integrate operation registry (create function types)
7. Implement parameter type inference
8. Add validation rules
9. Remove old type system code
10. Migrate tests
11. Test in VS Code extension

---

## Phase 2: Task Generation (NOT STARTED)

**Note**: Phase 2 (task generation) is handled by the `/speckit.tasks` command, not by `/speckit.plan`. This plan provides the foundation for task generation.

**Expected Task Structure** (for reference):
- **Setup Tasks**: Install dependencies, create directory structure
- **Infrastructure Tasks**: Define language specifics, create type system definition class
- **Type Definition Tasks**: Implement primitive types, operation function types
- **Inference Tasks**: Implement literal inference, parameter inference, variable inference
- **Validation Tasks**: Implement validation rules, error message formatting
- **Integration Tasks**: Register Typir services, wire into Langium module
- **Cleanup Tasks**: Remove old type system, update imports
- **Testing Tasks**: Migrate existing tests, add Typir-specific tests
- **Documentation Tasks**: Update CLAUDE.md, add examples

**Estimated Implementation Timeline**:
- Total effort: 23-33 hours (3-4 working days)
- See [quickstart.md](./quickstart.md) for phase-by-phase breakdown

---

## Risk Mitigation

### Known Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Typir API changes** | Medium | High | Pin Typir version in package.json, monitor releases, plan upgrade path |
| **Performance regression** | Low | Medium | Profile with realistic fixtures, use languageKey for performance, cache effectively |
| **Test migration complexity** | Medium | Medium | Keep custom type system code in backup directory during migration, gradual test migration |
| **Error message changes** | Low | Low | Preserve message templates in validation rules, regression tests for error format |
| **Unknown type edge cases** | Low | Medium | Extensive testing of untyped code, verify Typir's top type behaves as expected |

### Rollback Plan

If Typir integration fails or causes critical issues:

1. **Feature Flag**: Add `ENABLE_TYPIR_TYPE_SYSTEM` environment variable
2. **Legacy Code Preservation**: Keep custom type system in `type-system-legacy/` directory during migration
3. **Revert Strategy**: Restore legacy type system, revert service registration changes
4. **Issue Documentation**: Document Typir issues and blockers for future re-attempt

### Success Criteria Tracking

Track these metrics to verify successful migration:

- [ ] All 298 existing tests pass (including 25 type system tests)
- [ ] Type errors appear in IDE within 500ms of typing
- [ ] Autocomplete filters suggestions by type context (60% reduction in irrelevant suggestions)
- [ ] 100% backward compatibility (untyped code works unchanged)
- [ ] Error messages match existing format (95% similarity)
- [ ] No performance regression (< 50ms overhead for 100-200 line files)
- [ ] Large file support (1000+ lines without lag)

---

## Dependencies and Prerequisites

### External Dependencies

- **typir** (pnpm package) - Core type system library
  - Version: Latest stable (0.x)
  - License: Compatible with project
  - Documentation: Available in local checkout at `f:/projects/typir/`
  - Install: `pnpm add typir --filter @eligian/language`

- **typir-langium** (pnpm package) - Langium integration binding
  - Version: Latest stable (0.x)
  - Depends on: typir, langium
  - Examples: Available at `f:/projects/typir/examples/`
  - Install: `pnpm add typir-langium --filter @eligian/language`

### Internal Dependencies

- **Operation Registry**: `packages/language/src/compiler/operations/registry.generated.ts`
  - Provides operation signatures for function type creation
  - Must remain stable during migration

- **Grammar**: `packages/language/src/eligian.langium`
  - No changes required (type annotation syntax preserved)

- **Langium Services**: `packages/language/src/eligian-module.ts`
  - Requires service registration updates

### Development Environment

- Node.js >=20.10.0 (required by Langium 4.1.0)
- npm >=10.2.3 (engines requirement)
- pnpm (monorepo package manager)
- TypeScript 5.x (compiler)
- Vitest 3.2.4 (test runner)
- VS Code (for extension testing)

---

## Testing Strategy

### Test Migration Plan

**Existing Test Suite**:
- 298 total tests
- 25 type system-specific tests in `type-system.spec.ts`

**Migration Approach**:
1. **Phase 1**: Disable old type system tests
2. **Phase 2**: Implement Typir integration
3. **Phase 3**: Re-enable tests one category at a time
4. **Phase 4**: Fix failing tests (adjust assertions if needed)
5. **Phase 5**: Add Typir-specific tests (if new features)

**Test Categories**:

| Category | Test Count | Migration Strategy |
|----------|-----------|-------------------|
| Type annotation syntax | 10 | Should pass unchanged (grammar not modified) |
| Type checking integration | 10 | Verify Typir errors match expected format |
| Parameter type inference | 8 | Verify Typir inference matches current behavior |
| Backwards compatibility | 2 | Must pass (critical requirement) |

### Integration Testing

**VS Code Extension Testing** (manual):
- Open `.eligian` files with type errors → verify red squiggles
- Check Problems panel → verify error messages
- Test autocomplete → verify type filtering
- Test untyped code → verify no errors
- Test performance → verify < 500ms response time

**CLI Compilation Testing** (automated):
- Run compiler on test fixtures
- Verify type errors reported correctly
- Verify untyped code compiles successfully

### Performance Testing

**Benchmarks**:
- Typical file (100-200 lines): Target < 50ms type checking overhead
- Large file (1000+ lines): Target < 200ms type checking overhead
- IDE responsiveness: Target < 500ms for error appearance

**Profiling Tools**:
- Chrome DevTools (for language server profiling)
- VS Code Extension Host (for extension profiling)
- Typir built-in caching metrics

---

## Performance Optimization

### Caching Strategy

**Typir Built-in Caching**:
- Type inference results cached automatically via `DocumentCache`
- Cache invalidated when documents change (Langium lifecycle integration)
- No manual cache management required

**Operation Registry Caching**:
- Function types created once in `onInitialize()` (constant types)
- O(1) lookup for operation types during validation
- No invalidation needed (registry is static)

### Optimization Techniques

1. **Use `languageKey` over `filter`**:
   ```typescript
   // ✅ Preferred (faster)
   .inferenceRule({ languageKey: NumberLiteral.$type })

   // ❌ Avoid (slower)
   .inferenceRule({ filter: (node) => node.$type === 'NumberLiteral' })
   ```

2. **Batch Validation**: Typir validates entire documents (not individual nodes)

3. **Lazy Function Type Creation**: Create function types for operations only as needed (future optimization)

4. **Incremental Parsing**: Langium handles incremental document updates (Typir automatically invalidates affected types)

---

## References

### Documentation

- **Feature Specification**: [spec.md](./spec.md)
- **Research Findings**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)
- **Quick Start Guide**: [quickstart.md](./quickstart.md)
- **Project Constitution**: `.specify/memory/constitution.md`

### Typir Resources

- **Local Typir Checkout**: `f:/projects/typir/`
- **Typir Documentation**: `f:/projects/typir/documentation/`
- **Typir Examples**:
  - LOX: `f:/projects/typir/examples/lox/`
  - OX: `f:/projects/typir/examples/ox/`
- **Typir GitHub**: https://github.com/TypeFox/typir

### Existing Codebase

- **Current Type System**: `packages/language/src/type-system/`
- **Validator Integration**: `packages/language/src/eligian-validator.ts`
- **Operation Registry**: `packages/language/src/compiler/operations/registry.generated.ts`
- **Type System Tests**: `packages/language/src/__tests__/type-system.spec.ts`

---

## Next Steps

After `/speckit.plan` completion:

1. **Review Plan**: User reviews this plan document for accuracy and completeness
2. **Run `/speckit.tasks`**: Generate detailed task list from this plan
3. **Implementation**: Execute tasks in priority order (see quickstart.md for recommended sequence)
4. **Testing**: Verify each phase with tests before proceeding
5. **Documentation**: Update CLAUDE.md with Typir integration details
6. **Review**: Submit PR for code review and constitution compliance check
7. **Deploy**: Merge to main after all checks pass

---

## Conclusion

The Typir integration plan provides a clear path to replace Eligian's custom type system with a mature, battle-tested library. The plan maintains 100% backward compatibility while establishing a foundation for future type system enhancements. With comprehensive research, detailed design artifacts, and a phased implementation guide, the migration is ready to proceed to task generation and implementation.

**Key Advantages of Typir Approach**:
- ✅ Proven in production (used by Langium language projects)
- ✅ Automatic Langium integration (document lifecycle, validation)
- ✅ Extensible architecture (easy to add union types, generics in future)
- ✅ Performance-optimized (built-in caching, efficient inference)
- ✅ Well-documented (local checkout with examples)
- ✅ Active development (TypeFox maintains it)

**Ready for**: `/speckit.tasks` command to generate implementation tasks.
