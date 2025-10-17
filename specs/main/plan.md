# Implementation Plan: Type System Enhancements (Phase 18)

**Branch**: `main` | **Date**: 2025-10-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/main/spec.md`

**Note**: This plan implements optional static type checking for the Eligian DSL, catching type mismatches at compile time.

## Summary

Add TypeScript-style optional static type checking to the Eligian DSL compiler. This includes:
1. **Type annotation syntax** for action parameters (`action foo(x: string)`)
2. **Type inference** from operation signatures and usage patterns
3. **Compile-time validation** of type compatibility across variables, parameters, and operation calls

The implementation follows a progressive enhancement approach - type annotations are optional and all existing code continues to work unchanged.

## Technical Context

**Language/Version**: TypeScript 5.7+ with Node.js 19+
**Primary Dependencies**:
- Langium (language server framework)
- Effect-ts (functional programming)
- Vitest (testing)
- Biome (linting/formatting)

**Storage**: N/A (compiler feature, no persistent storage)
**Testing**: Vitest with unit tests + integration tests
**Target Platform**: Node.js CLI + VS Code Extension
**Project Type**: Compiler enhancement (monorepo structure)
**Performance Goals**: Type checking adds <50ms to compilation time
**Constraints**:
- Must not break existing code (backwards compatible)
- Type annotations are optional
- Must integrate with Langium's validation framework

**Scale/Scope**:
- ~50-100 lines of grammar changes
- ~300-500 lines of type inference engine
- ~200-300 lines of validation logic
- 30-50 new tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [X] **Simplicity & Documentation** (Principle I):
  - Type system is opt-in, not mandatory
  - Simple type annotation syntax (`param: type`)
  - Clear documentation planned for each component
  - No complex type features (no generics, unions, etc.)

- [X] **Comprehensive Testing** (Principle II):
  - Unit tests for type inference engine
  - Unit tests for type validation logic
  - Integration tests for grammar changes
  - Regression tests for existing code (ensure no breakage)

- [X] **No Gold-Plating** (Principle III):
  - Solves documented need: catch type errors at compile time
  - User stories show real use cases (see spec.md)
  - No speculative features (no generics, advanced types, etc.)
  - Deferred until user request warranted it

- [X] **Functional Programming** (Principle VI):
  - Type inference engine will be pure functions
  - External immutability maintained
  - Effect-ts for validation pipeline integration

- [X] **Biome Integration** (Principle XI):
  - All new code will be Biome-compliant
  - Run `npm run check` after each task

- [X] **Validation Pattern** (Principle X):
  - Type validation logic in compiler package first
  - Langium validator as thin adapter
  - Pure functions returning typed errors

*All constitution checks pass ✅*

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (existing monorepo structure)

```
packages/
├── language/                      # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium       # Grammar (type annotation syntax added)
│   │   ├── eligian-validator.ts  # Validation (type checking added)
│   │   ├── type-system/          # NEW: Type checking implementation
│   │   │   ├── types.ts          # Type system types
│   │   │   ├── inference.ts      # Type inference engine
│   │   │   └── validator.ts      # Type validation logic
│   │   └── __tests__/
│   │       ├── parsing.spec.ts   # Grammar tests (type annotations)
│   │       └── type-system.spec.ts  # NEW: Type checking tests
│   └── package.json
│
├── compiler/                      # NOT USED FOR THIS FEATURE
│   └── (type checking is language-level, not compiler-level)
│
└── cli/                          # Command-line compiler
    └── (no changes needed - uses language package)
```

**Structure Decision**:

This feature lives entirely in the `packages/language` directory because:
1. Type checking is a language-level concern (IDE integration)
2. Grammar changes require Langium grammar updates
3. Validation integrates with Langium's validation framework
4. The compiler package is for AST transformation, not type checking

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
