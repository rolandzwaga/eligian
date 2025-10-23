# Implementation Plan: Constant Folding Optimization

**Branch**: `005-const-folding-compiler` | **Date**: 2025-01-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-const-folding-compiler/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement compiler optimization to replace global constant references with their literal values at compile time, eliminating unnecessary globalData assignments and init actions. This reduces generated JSON size by 20%+ and removes runtime overhead for constant lookups.

**Technical Approach**: Extend the existing AST transformer to detect `const` declarations, build a constant value map, and replace all variable references with literal values during JSON generation. Modify init action generation to exclude constants. For User Story 3 (P3), add a compile-time expression evaluator for simple arithmetic, string concatenation, and logical operations.

## Technical Context

**Language/Version**: TypeScript 5.9.3 with Node.js 22+ (ESM)
**Primary Dependencies**: Langium 4.0.3 (AST/grammar), Effect-TS 3.18.4 (compiler pipeline), Vitest 3.2.4 (testing)
**Storage**: N/A (compiler optimization, no persistent storage)
**Testing**: Vitest with unit tests in `__tests__/` subdirectories, integration tests for full compilation pipeline
**Target Platform**: Node.js 22+ with ESM module resolution (compiler runs in Node.js, generates JSON for Eligius runtime)
**Project Type**: Monorepo (packages/language contains compiler)
**Performance Goals**: Compilation time increase <10% (SC-003), generated JSON size reduction 20%+ (SC-001)
**Constraints**: Must maintain backward compatibility (SC-004), preserve runtime behavior (FR-008), handle all primitive types (string, number, boolean)
**Scale/Scope**: Optimization pass in existing compiler, ~300-500 LOC addition, affects all global `const` declarations in Eligian source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [X] **Simplicity & Documentation**: Approach is straightforward - build constant map during AST traversal, replace references during transformation. Well-documented in research.md and quickstart.md.
- [X] **Comprehensive Testing**: Unit tests for constant detection, reference replacement, expression evaluation. Integration tests for full pipeline with before/after JSON comparison.
- [X] **No Gold-Plating**: Solves real need - current compiler generates inefficient code for constants. User Story 3 (expression evaluation) is P3 and can be deferred.
- [X] **Code Review**: Standard PR review process applies (2+ approvals required per constitution)
- [X] **UX Consistency**: N/A - compiler optimization is transparent to users
- [X] **Functional Programming**: Maintains external immutability (AST is read-only, transformation produces new IR). No mutation of input AST. Effect-ts pipeline structure preserved.

*All checks pass. No violations to justify.*

## Project Structure

### Documentation (this feature)

```
specs/005-const-folding-compiler/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (constant folding patterns, expression evaluation strategies)
├── data-model.md        # Phase 1 output (constant value representation, symbol table structure)
├── quickstart.md        # Phase 1 output (step-by-step implementation guide)
├── contracts/           # N/A (no external APIs for compiler optimization)
└── checklists/
    └── requirements.md  # Validation checklist (complete, all items pass)
```

### Source Code (repository root)

```
packages/language/
├── src/
│   ├── compiler/
│   │   ├── ast-transformer.ts       # MODIFY: Add constant map building, reference replacement
│   │   ├── optimizer.ts             # MODIFY: Add constant folding pass
│   │   ├── constant-folder.ts       # NEW: Core constant folding logic
│   │   ├── expression-evaluator.ts  # NEW (P3): Compile-time expression evaluation
│   │   └── __tests__/
│   │       ├── constant-folder.spec.ts  # NEW: Unit tests for constant folding
│   │       ├── expression-evaluator.spec.ts  # NEW (P3): Expression eval tests
│   │       └── transformer.spec.ts  # MODIFY: Add tests for constant inlining
│   ├── generated/
│   │   └── ast.ts                   # READ: Understand ConstDeclaration AST node structure
│   └── eligian.langium              # READ: Verify const/let grammar rules
└── package.json

tests/
└── integration/
    └── constant-folding.spec.ts     # NEW: End-to-end tests with fixture files
```

**Structure Decision**: Single project (Option 1) - this is a compiler enhancement within the existing `packages/language` structure. No new packages or modules required. The constant folding logic is self-contained in new files (`constant-folder.ts`, `expression-evaluator.ts`) with minimal changes to existing files (`ast-transformer.ts`, `optimizer.ts`).

## Complexity Tracking

*No constitutional violations - this section is empty.*

---

## Phase 0: Research & Discovery

### Research Tasks

1. **Constant Folding Patterns**
   - Review standard compiler optimization techniques for constant folding
   - Investigate TypeScript compiler's constant folding implementation (reference)
   - Document best practices for symbol table / constant map design

2. **Expression Evaluation Strategies**
   - Research safe compile-time expression evaluation (prevent infinite loops, type errors)
   - Evaluate existing libraries (e.g., `js-interpreter`, `eval` alternatives)
   - Decide: implement custom evaluator vs. use existing library

3. **AST Traversal Integration**
   - Review existing `ast-transformer.ts` structure
   - Identify hooks for constant detection and reference replacement
   - Document integration points with optimizer pipeline

4. **Backward Compatibility Strategy**
   - Analyze existing test fixtures that use `const` declarations
   - Plan approach for detecting regression (before/after JSON comparison)
   - Design feature flag if needed (or always-on optimization)

### Deliverable

**`research.md`** containing:
- Decision: Custom expression evaluator vs. library (with rationale)
- Decision: Symbol table structure (Map<string, LiteralValue> or more complex)
- Decision: Optimization pass placement (before/after existing optimizer)
- Decision: Transitive constant resolution strategy (User Story 3 edge case)
- Alternatives considered and why they were rejected

---

## Phase 1: Design Artifacts

### Data Model

**`data-model.md`** containing:

1. **ConstantValue** type:
   - Fields: `name: string`, `value: string | number | boolean`, `type: 'string' | 'number' | 'boolean'`
   - Usage: Stored in constant map during AST traversal

2. **ConstantMap** structure:
   - Type: `Map<string, ConstantValue>`
   - Scope: Global scope only (MVP)
   - Lifecycle: Built during AST traversal, used during transformation

3. **ExpressionEvaluationResult** (User Story 3):
   - Fields: `value: string | number | boolean | Error`, `canEvaluate: boolean`
   - Usage: Return type from expression evaluator

### API Contracts

**N/A** - This is an internal compiler optimization with no external APIs.

### Quickstart Guide

**`quickstart.md`** containing:

1. **Prerequisites**: Existing compiler knowledge, AST traversal understanding
2. **Implementation Steps**:
   - Step 1: Create `constant-folder.ts` with `buildConstantMap()` function
   - Step 2: Modify `ast-transformer.ts` to call `buildConstantMap()` before transformation
   - Step 3: Implement `replaceConstantReferences()` in transformer
   - Step 4: Modify init action generation to filter out constants
   - Step 5: Add tests for each step
   - Step 6 (P3): Implement `expression-evaluator.ts` for User Story 3
3. **Testing Strategy**: Unit tests first (TDD), then integration tests
4. **Validation**: Compare before/after JSON, verify no `$globalData.<const>` patterns

---

## Phase 2: Task Generation

*This phase is executed by `/speckit.tasks`, not `/speckit.plan`.*

**Deliverable**: `tasks.md` with dependency-ordered tasks for implementation.

---

## Notes

- **User Story Priority**: Implement P1 first (inline constants), then P2 (eliminate init), defer P3 (expressions) if needed
- **Test-First Development**: Follow constitution Principle II - write tests before implementation
- **Performance**: Monitor compilation time regression (SC-003: <10% increase)
- **Backward Compatibility**: Run all existing tests after optimization to ensure no breaking changes (SC-004)
