# Implementation Plan: Test Coverage Improvement

**Branch**: `004-test-coverage-improvement` | **Date**: 2025-01-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-test-coverage-improvement/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Fix all failing unit tests and achieve 80% test coverage threshold for business logic files. This involves examining test failures related to Eligian DSL syntax, updating test expectations to match current grammar and validation rules, generating coverage reports, and adding unit tests to cover untested code paths in files below the 80% threshold.

## Technical Context

**Language/Version**: TypeScript 5.9.3 with Node.js 22+ (ESM)
**Primary Dependencies**: Vitest (test framework), @vitest/coverage-v8 (coverage reporting), Langium (DSL framework)
**Storage**: N/A (testing infrastructure)
**Testing**: Vitest with unit tests in `__tests__/` subdirectories
**Target Platform**: Node.js 22+ with ESM module resolution
**Project Type**: Monorepo (packages/language, packages/compiler, packages/cli, packages/extension)
**Performance Goals**: Test suite execution <2 minutes, coverage report generation <30 seconds
**Constraints**: Must achieve 80% coverage for statements, branches, functions, and lines in all business logic files
**Scale/Scope**: ~400+ existing tests, primary focus on packages/language/src/ for compiler and validation logic

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is straightforward - fix failing tests, generate coverage reports, add tests for uncovered paths. No unnecessary complexity.
- [x] **Comprehensive Testing**: This feature IS about testing - improving test coverage to constitutional 80% threshold (Principle II)
- [x] **No Gold-Plating**: Solves documented constitutional requirement (Principle II: mandatory 80% coverage). No speculative features.
- [x] **Code Review**: Standard PR process applies - all test additions will be reviewed
- [x] **UX Consistency**: N/A - internal testing infrastructure, no user-facing interfaces
- [x] **Functional Programming**: N/A - test code, not production code architecture

*All checks pass. This feature directly implements Constitution Principle II (Comprehensive Testing) requirements.*

## Project Structure

### Documentation (this feature)

```
specs/004-test-coverage-improvement/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification
├── research.md          # Phase 0: Research on test patterns and coverage tools
├── checklists/
│   └── requirements.md  # Spec quality validation
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Note**: This feature adds tests to existing structure, does not change architecture.

```
packages/
├── language/
│   └── src/
│       └── __tests__/           # Unit tests for Langium grammar, validator, scope
│           ├── parsing.spec.ts
│           ├── validation.spec.ts
│           ├── scoping.spec.ts
│           ├── type-system.spec.ts
│           └── [new test files as needed]
│
├── compiler/
│   └── src/
│       └── __tests__/           # Unit tests for AST transformer, optimizer
│           ├── transformer.spec.ts
│           ├── optimizer.spec.ts
│           └── [new test files as needed]
│
├── cli/
│   └── src/
│       └── __tests__/           # CLI integration tests (out of scope for this feature)
│
└── extension/
    └── src/
        └── __tests__/           # Extension tests (out of scope for this feature)
```

**Structure Decision**: Tests follow existing Vitest structure with `__tests__/` subdirectories alongside source files. No structural changes needed - only adding/updating test files within existing directories.

## Complexity Tracking

*No constitutional violations. This feature implements constitutional requirements.*

## Phase 0: Research

### Research Questions

1. **Current test failure root causes**: Why are existing tests failing?
2. **Coverage reporting configuration**: Is Vitest coverage properly configured?
3. **Test patterns for DSL validation**: What patterns work best for testing Langium validators?
4. **Unreachable code identification**: How to identify and document legitimately untestable code?

### Research Findings

**Decision 1: Test Failure Analysis**

- **Rationale**: Must understand why tests fail before fixing them (Constitution Principle XIV - Question-First Implementation)
- **Approach**: Run `npm run test` and categorize failures:
  - Outdated grammar expectations (tests expect old DSL syntax)
  - Implementation bugs (code doesn't match test expectations)
  - Environment issues (Node.js version, ESM import issues)

**Decision 2: Coverage Configuration**

- **Rationale**: Coverage reporting must exclude generated files and test files (FR-007, FR-008)
- **Configuration**: Verify `vitest.config.ts` includes:
  ```typescript
  coverage: {
    provider: 'v8',
    exclude: [
      '**/*.generated.ts',
      '**/__tests__/**',
      '**/generated/**',
      '**/*.spec.ts'
    ],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  }
  ```

**Decision 3: Langium Test Patterns**

- **Rationale**: Langium has specific testing utilities (Principle XVIII - Research & Documentation Standards)
- **Patterns**:
  - Use `parseHelper` from Langium testing utils for grammar tests
  - Use `validationHelper` for validation rule tests
  - Test AST structure with typed assertions
  - Mock Langium services when testing in isolation

**Decision 4: Unreachable Code Documentation**

- **Rationale**: Some code may be legitimately untestable (error handlers for impossible states)
- **Approach**: Document with code comments: `// Coverage exception: [reason]` and request user approval per Constitution Principle II

### Alternatives Considered

- **Alternative 1**: Refactor code to improve testability
  - **Rejected**: Out of scope (see spec - only add tests, don't change implementation)
- **Alternative 2**: Achieve 100% coverage
  - **Rejected**: Constitutional threshold is 80%, not 100% (diminishing returns)
- **Alternative 3**: Add integration tests
  - **Rejected**: Focus on unit tests only (spec scope)

## Phase 1: Design & Contracts

### Data Model

*Not applicable - this feature works with existing test infrastructure. No new data models.*

### API Contracts

*Not applicable - this feature improves test coverage for existing APIs. No new contracts.*

### Test Strategy Design

**Test Categories**:

1. **Grammar Tests** (`packages/language/src/__tests__/parsing.spec.ts`):
   - Valid DSL syntax parsing
   - Invalid syntax error handling
   - AST structure validation

2. **Validation Tests** (`packages/language/src/__tests__/validation.spec.ts`):
   - Semantic validation rules (operation existence, parameter types, loop context)
   - Error message formatting
   - Validation helper integration

3. **Type System Tests** (`packages/language/src/__tests__/type-system.spec.ts`):
   - Type inference logic
   - Type constraint validation
   - Type error reporting

4. **Transformer Tests** (`packages/compiler/src/__tests__/transformer.spec.ts`):
   - AST to Eligius JSON transformation
   - Operation metadata consultation
   - UUID generation for identifiers

5. **Optimizer Tests** (`packages/compiler/src/__tests__/optimizer.spec.ts`):
   - Dead code elimination
   - Constant folding
   - Timeline optimization

**Coverage Analysis Process**:

1. Run `npm run test` - fix all failures
2. Run `npm run test:coverage` - identify files below 80%
3. For each file below threshold:
   - Read source code and identify uncovered lines
   - Categorize: missing tests vs unreachable code
   - Write unit tests for uncovered paths (or document exceptions)
4. Re-run coverage until threshold met
5. Commit with test additions

**Test Fixture Management**:

- Reuse existing `.eligian` fixture files in `__tests__/__fixtures__/`
- Add new fixtures only when testing new code paths
- Keep fixtures minimal and focused (single feature per file)

### Quickstart Guide

See [quickstart.md](./quickstart.md) for step-by-step implementation guide.

## Phase 2: Task Breakdown

**Note**: Task generation happens via `/speckit.tasks` command after this plan is complete.

Tasks will cover:
1. Fix failing tests (P1 - User Story 1)
2. Generate coverage report and identify gaps (P2 - User Story 2)
3. Add tests for uncovered code paths (P2 - User Story 2)
4. Verify threshold achievement (P2 - User Story 2)
5. Document coverage exceptions if needed (P2 - User Story 2)

## Constitution Re-Check

*Re-evaluate after Phase 1 design:*

- [x] **Simplicity**: Design adds tests without architectural changes
- [x] **Testing**: This feature improves testing infrastructure itself
- [x] **No Gold-Plating**: Focused on constitutional 80% requirement
- [x] **Functional Programming**: Test code doesn't affect production architecture
- [x] **Test-First Development**: This feature fixes/adds tests - inherently test-focused

*All constitutional principles satisfied.*
