# Tasks: Languages Declaration Syntax

**Feature**: 037-languages-syntax
**Input**: Design documents from `/specs/037-languages-syntax/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This feature extends the existing Eligian DSL monorepo:
- **Language package**: `packages/language/src/`
- **Tests**: `packages/language/src/__tests__/`
- **Examples**: `examples/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and grammar foundation

- [ ] T001 Add LanguagesBlock and LanguageEntry grammar rules to `packages/language/src/eligian.langium`
- [ ] T002 Modify Program grammar rule to include `languages=LanguagesBlock?` as first element in `packages/language/src/eligian.langium`
- [ ] T003 [P] Run Langium code generation via `pnpm run langium:generate` to update AST types
- [ ] T004 [P] Verify generated AST types in `packages/language/src/generated/ast.ts` include LanguagesBlock and LanguageEntry interfaces

**Checkpoint**: Grammar rules defined, AST types generated

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Create language code validation regex constant `/^[a-z]{2,3}-[A-Z]{2,3}$/` in `packages/language/src/compiler/constants.ts`
- [ ] T006 Add `transformLanguagesBlock()` function stub (returns defaults) in `packages/language/src/compiler/ast-transformer.ts`
- [ ] T007 Add validation helper `isValidLanguageCode(code: string): boolean` in `packages/language/src/eligian-validator.ts`
- [ ] T008 [P] Create test helpers for languages block testing in `packages/language/src/__tests__/test-helpers.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Single Language Declaration (Priority: P1) 🎯 MVP

**Goal**: Allow developers to declare a single presentation language that automatically becomes the default

**Independent Test**: Write a `.eligian` file with single language block, compile, verify `language` and `availableLanguages` properties in output JSON

### Tests for User Story 1

> **NOTE: Write these tests FIRST per TDD (Constitution Principle V), ensure they FAIL before implementation**

- [ ] T009 [P] [US1] Parsing test: single language block in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T010 [P] [US1] Transformation test: single language → ILabel array in `packages/language/src/__tests__/transformer.spec.ts`

### Implementation for User Story 1

- [ ] T011 [US1] Implement `transformLanguagesBlock()` for single language case in `packages/language/src/compiler/ast-transformer.ts`
  - Extract language code and label from single entry
  - Generate UUID v4 for ILabel.id using `crypto.randomUUID()`
  - Return `{ language: code, availableLanguages: [ILabel] }`
- [ ] T012 [US1] Update `transformAST()` to call `transformLanguagesBlock()` with `program.languages` in `packages/language/src/compiler/ast-transformer.ts`
- [ ] T013 [US1] Handle undefined languages block (backward compatibility - default to en-US) in `packages/language/src/compiler/ast-transformer.ts`
- [ ] T014 [US1] Run tests via `mcp__vitest__run_tests` with target `packages/language/src/__tests__/parsing.spec.ts` and verify passing
- [ ] T015 [US1] Run tests via `mcp__vitest__run_tests` with target `packages/language/src/__tests__/transformer.spec.ts` and verify passing
- [ ] T016 [US1] Create example file `examples/languages-single.eligian` demonstrating single language syntax

**Checkpoint**: Single language declarations work end-to-end (parse → transform → compile)

---

## Phase 4: User Story 2 - Multiple Languages with Explicit Default (Priority: P2)

**Goal**: Allow developers to declare multiple languages with `*` marker indicating the default

**Independent Test**: Write a `.eligian` file with 3 languages (one marked with `*`), compile, verify correct default in `language` property

### Tests for User Story 2

- [ ] T017 [P] [US2] Parsing test: multiple languages with `*` marker in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T018 [P] [US2] Transformation test: default language selected correctly in `packages/language/src/__tests__/transformer.spec.ts`
- [ ] T019 [P] [US2] Validation test: missing `*` marker error in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T020 [P] [US2] Validation test: multiple `*` markers error in `packages/language/src/__tests__/validation.spec.ts`

### Implementation for User Story 2

- [ ] T021 [P] [US2] Extend `transformLanguagesBlock()` to find entry with `isDefault === true` in `packages/language/src/compiler/ast-transformer.ts`
- [ ] T022 [P] [US2] Map all entries to ILabel array with UUID generation in `packages/language/src/compiler/ast-transformer.ts`
- [ ] T023 [US2] Implement `checkDefaultMarker()` validator in `packages/language/src/eligian-validator.ts`
  - Count entries with `isDefault === true`
  - If entries.length > 1 and count === 0: error "Multiple languages require exactly one * marker to indicate the default"
  - If count > 1: error "Only one language can be marked as default"
- [ ] T024 [US2] Register `checkDefaultMarker()` for LanguagesBlock in `packages/language/src/eligian-validator.ts`
- [ ] T025 [US2] Run tests via `mcp__vitest__run_tests` with target `packages/language/src/__tests__/validation.spec.ts` and verify passing
- [ ] T026 [US2] Create example file `examples/languages-multiple.eligian` demonstrating multiple languages with default marker

**Checkpoint**: Multiple language declarations with explicit defaults work correctly

---

## Phase 5: User Story 3 - First Declaration Enforcement (Priority: P1)

**Goal**: Ensure languages block appears first in file for predictable structure

**Independent Test**: Attempt to place languages block after `layout` import, verify parse error or validation error

### Tests for User Story 3

- [ ] T027 [P] [US3] Parsing test: languages block first (valid) in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T028 [P] [US3] Parsing test: languages block after layout (invalid) in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T029 [P] [US3] Parsing test: languages block after styles (invalid) in `packages/language/src/__tests__/parsing.spec.ts`
- [ ] T030 [P] [US3] Parsing test: languages block after action (invalid) in `packages/language/src/__tests__/parsing.spec.ts`

### Implementation for User Story 3

- [ ] T031 [US3] Verify grammar rule enforces first position (Program: languages=LanguagesBlock? ...) in `packages/language/src/eligian.langium`
- [ ] T032 [US3] If grammar doesn't enforce: add `checkLanguagesBlockPosition()` validator in `packages/language/src/eligian-validator.ts`
- [ ] T033 [US3] Run tests via `mcp__vitest__run_tests` with target `packages/language/src/__tests__/parsing.spec.ts` and verify passing
- [ ] T034 [US3] Update quickstart.md with position requirement examples if not already present

**Checkpoint**: Languages block position is enforced at parse or validation time

---

## Phase 6: User Story 4 - Language Code Validation (Priority: P2)

**Goal**: Catch invalid language code formats at compile time with helpful error messages

**Independent Test**: Write languages block with invalid code (`EN-US`, `en-us`, `english`), verify actionable error messages

### Tests for User Story 4

- [ ] T035 [P] [US4] Validation test: valid IETF codes (`en-US`, `nl-NL`, `fr-FR`) in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T036 [P] [US4] Validation test: uppercase primary (`EN-US`) error in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T037 [P] [US4] Validation test: lowercase region (`en-us`) error in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T038 [P] [US4] Validation test: no region (`english`) error in `packages/language/src/__tests__/validation.spec.ts`
- [ ] T039 [P] [US4] Validation test: duplicate language codes error in `packages/language/src/__tests__/validation.spec.ts`

### Implementation for User Story 4

- [ ] T040 [P] [US4] Implement `checkLanguageCodeFormat()` validator using regex `/^[a-z]{2,3}-[A-Z]{2,3}$/` in `packages/language/src/eligian-validator.ts`
  - Error message: "Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')"
- [ ] T041 [P] [US4] Implement `checkDuplicateLanguageCodes()` validator with Set tracking in `packages/language/src/eligian-validator.ts`
  - Error message: "Duplicate language code: '{code}'"
- [ ] T042 [P] [US4] Implement `checkSingleLanguagesBlock()` validator in `packages/language/src/eligian-validator.ts`
  - Error message: "Only one languages block allowed per file"
- [ ] T043 [P] [US4] Implement `checkNonEmptyLanguagesBlock()` validator in `packages/language/src/eligian-validator.ts`
  - Error message: "Languages block cannot be empty"
- [ ] T044 [US4] Register all validators (checkLanguageCodeFormat, checkDuplicateLanguageCodes, checkSingleLanguagesBlock, checkNonEmptyLanguagesBlock) in `packages/language/src/eligian-validator.ts`
- [ ] T045 [US4] Run tests via `mcp__vitest__run_tests` with target `packages/language/src/__tests__/validation.spec.ts` and verify passing
- [ ] T046 [US4] Create example file `examples/languages-validation-errors.eligian` with commented-out error cases

**Checkpoint**: Language code validation catches all format errors with clear messages

---

## Phase 7: User Story 5 - Typir Type Integration (Priority: P3)

**Goal**: Provide IDE hover support showing language count and default via Typir type system

**Independent Test**: Hover over languages block in VS Code, verify hover tooltip shows "Languages: X languages, default: YY-ZZ"

### Tests for User Story 5

- [ ] T047 [P] [US5] Type factory test: create LanguagesType with correct properties in `packages/language/src/type-system-typir/__tests__/languages-type.spec.ts`
- [ ] T048 [P] [US5] Type name test: verify singular/plural "language" vs "languages" in `packages/language/src/type-system-typir/__tests__/languages-type.spec.ts`
- [ ] T049 [P] [US5] Type identifier test: verify caching format "Languages:count:default" in `packages/language/src/type-system-typir/__tests__/languages-type.spec.ts`
- [ ] T050 [P] [US5] Inference test: LanguagesBlock AST → LanguagesType in `packages/language/src/type-system-typir/__tests__/languages-type.spec.ts`

### Implementation for User Story 5

- [ ] T051 [P] [US5] Create `LanguagesTypeProperties` interface in `packages/language/src/type-system-typir/types/languages-type.ts`
  - Properties: languageCount, defaultLanguage, allLanguages
  - Index signature for Typir compliance
- [ ] T052 [P] [US5] Implement `calculateLanguagesTypeName()` function in `packages/language/src/type-system-typir/types/languages-type.ts`
  - Format: "Languages: {count} language(s), default: {code}"
  - Singular "language" when count === 1, plural otherwise
- [ ] T053 [P] [US5] Implement `calculateLanguagesTypeIdentifier()` function in `packages/language/src/type-system-typir/types/languages-type.ts`
  - Format: "Languages:{count}:{defaultLanguage}"
- [ ] T054 [P] [US5] Implement `createLanguagesTypeFactory()` using CustomKind in `packages/language/src/type-system-typir/types/languages-type.ts`
- [ ] T055 [P] [US5] Create `registerLanguagesInference()` function in `packages/language/src/type-system-typir/inference/languages-inference.ts`
  - Inference rule for LanguagesBlock → LanguagesType
  - Extract defaultLanguage from entry with isDefault===true or first entry
- [ ] T056 [P] [US5] Create `registerLanguagesValidation()` function in `packages/language/src/type-system-typir/validation/languages-validation.ts`
  - Typir-level validation for duplicate codes, default marker rules
- [ ] T057 [US5] Register LanguagesType factory in `packages/language/src/type-system-typir/eligian-type-system.ts`
  - Create factory, register inference, register validation
- [ ] T058 [US5] Run tests via `mcp__vitest__run_tests` with target `packages/language/src/type-system-typir/__tests__/languages-type.spec.ts` and verify passing
- [ ] T059 [US5] Manually test hover tooltip in VS Code extension (hover over languages block, verify type display)

**Checkpoint**: Typir integration complete, IDE hover support working

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, documentation, and quality gates

- [ ] T060 [P] Run Biome check via `pnpm run check` and fix any linting/formatting issues
- [ ] T061 [P] Run full test suite via `mcp__vitest__run_tests` with target `packages/language/src` and verify all tests passing
- [ ] T062 [P] Analyze test coverage via `mcp__vitest__analyze_coverage` with target `packages/language/src` and verify ≥80% coverage
- [ ] T063 [P] Create comprehensive demo file `examples/languages-demo.eligian` showcasing all features:
  - Single language
  - Multiple languages with default
  - Position requirement
  - Valid language codes
- [ ] T064 [P] Update `LANGUAGE_SPEC.md` with languages syntax documentation (if project maintains language spec)
- [ ] T065 Verify backward compatibility: compile existing .eligian files without languages block, ensure defaults to en-US
- [ ] T066 Manual integration test: Create new .eligian file with languages block, compile via CLI, verify JSON output correctness
- [ ] T067 Manual VS Code test: Open .eligian file with languages block, verify syntax highlighting, validation errors, hover tooltips work

**Final Checkpoint**: All features implemented, tested, documented, and quality gates passed

---

## Task Summary

**Total Tasks**: 67
**By User Story**:
- Setup: 4 tasks
- Foundational: 4 tasks
- US1 (Single Language): 8 tasks (7 implementation, 2 tests) - MVP
- US2 (Multiple Languages): 10 tasks (6 implementation, 4 tests)
- US3 (First Declaration): 8 tasks (4 implementation, 4 tests)
- US4 (Language Code Validation): 12 tasks (7 implementation, 5 tests)
- US5 (Typir Integration): 13 tasks (9 implementation, 4 tests)
- Polish: 8 tasks

**Parallel Opportunities**: 41 tasks marked [P] can run in parallel within their phase

---

## Dependencies

### User Story Dependency Graph

```
Setup (T001-T004)
  ↓
Foundational (T005-T008)
  ↓
  ├─→ US1: Single Language (T009-T016) ← MVP - IMPLEMENT FIRST
  ├─→ US3: First Declaration (T027-T034) ← Depends on grammar (can run with US1)
  │
  └─→ US1 Complete
      ├─→ US2: Multiple Languages (T017-T026) ← Extends US1
      ├─→ US4: Language Code Validation (T035-T046) ← Can run parallel to US2
      └─→ US5: Typir Integration (T047-T059) ← Can run parallel to US2/US4
          ↓
          Polish (T060-T067)
```

### Parallel Execution Examples

**After Setup & Foundational Complete**:
- US1 + US3 can run in parallel (both P1 priority)

**After US1 Complete**:
- US2 + US4 + US5 can run in parallel (all extend/enhance US1)

---

## Implementation Strategy

### MVP Scope (User Story 1 Only)

The minimum viable product includes only US1:
- Grammar rules for LanguagesBlock and LanguageEntry
- Single language declaration (implicit default)
- Basic AST transformation to Eligius configuration
- Backward compatibility (no languages block → en-US default)

**Deliverable**: Developers can declare one language, compile successfully, and see correct output

### Incremental Delivery

1. **Sprint 1**: Setup + Foundational + US1 + US3 (MVP with position enforcement)
2. **Sprint 2**: US2 + US4 (Multiple languages with validation)
3. **Sprint 3**: US5 + Polish (Typir integration and final quality)

Each sprint delivers independently testable value.

---

## Format Validation

✅ **All tasks follow required checklist format**:
- Checkbox: `- [ ]`
- Task ID: T001-T067 (sequential)
- [P] marker: 41 tasks parallelizable
- [Story] label: All user story tasks labeled (US1-US5)
- File paths: All implementation tasks include exact file paths