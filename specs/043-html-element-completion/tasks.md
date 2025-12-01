# Tasks: HTML Element Completion for createElement

**Input**: Design documents from `/specs/043-html-element-completion/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Following constitution principle V (TDD), tests are written first.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
- **Language package**: `packages/language/src/`
- **HTML module**: `packages/language/src/html/`
- **Completion module**: `packages/language/src/completion/`
- **Scripts**: `scripts/`
- **Tests**: `__tests__/` subdirectories alongside code

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, metadata types, and build-time generator

- [x] T001 [P] Create metadata types file in packages/language/src/html/metadata-types.ts
- [x] T002 [P] Create HTMLCompletionContextType enum in packages/language/src/html/context-types.ts
- [x] T003 Create build-time metadata generator script in scripts/generate-html-metadata.ts
- [x] T004 Add pnpm script for metadata generation in package.json (e.g., `generate:html-metadata`)
- [x] T005 Run generator to produce packages/language/src/completion/html-elements.generated.ts

**Checkpoint**: Generated metadata file exists with all 112 HTML elements and their attributes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Context detection module that ALL user stories depend on

**CRITICAL**: No user story work can begin until context detection is complete

- [x] T006 [P] Write context detection tests in packages/language/src/html/__tests__/context-detection.spec.ts
- [x] T007 Implement detectHTMLCompletionContext() in packages/language/src/html/context-detection.ts
- [x] T008 Add helper to extract element name from first argument in packages/language/src/html/context-detection.ts
- [x] T009 Add helper to extract attribute name from object property in packages/language/src/html/context-detection.ts
- [x] T010 Verify tests pass for all context types (None, ElementName, AttributeName, AttributeValue)

**Checkpoint**: Context detection works for all three context types - user story implementation can now begin

---

## Phase 3: User Story 1 - HTML Element Name Completion (Priority: P1) MVP

**Goal**: Provide completion for all 112 HTML element names when cursor is in createElement's first parameter

**Independent Test**: Type `createElement("|")` and verify completion list shows div, span, button, etc.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**
> **REQUIRED: Consult specs/TESTING_GUIDE.md before writing tests. Use createTestContext() in beforeAll() per constitution XXIV.**

- [x] T011 [P] [US1] Write element name completion tests in packages/language/src/completion/__tests__/html-elements.spec.ts (use createTestContext())
- [x] T012 [P] [US1] Test case: all 112 elements appear when cursor in empty string
- [x] T013 [P] [US1] Test case: filtering works with partial text (e.g., "bu" filters to "button")
- [x] T014 [P] [US1] Test case: completions are sorted alphabetically
- [x] T015 [P] [US1] Test case: detail text shows "HTML element"

### Implementation for User Story 1

- [x] T016 [US1] Create HTMLElementCompletionProvider class in packages/language/src/completion/html-elements.ts
- [x] T017 [US1] Implement provideElementNameCompletions() method using generated metadata
- [x] T018 [US1] Add in-string completion support (TextEdit for replacing content within quotes)
- [x] T019 [US1] Add filtering by partial text typed by user
- [x] T020 [US1] Integrate with EligianCompletionProvider in packages/language/src/eligian-completion-provider.ts
- [x] T021 [US1] Add check for ElementName context type before providing completions
- [x] T022 [US1] Verify all tests pass and manual testing works

**Checkpoint**: User Story 1 complete - element name completion works independently

---

## Phase 4: User Story 2 - Element-Specific Attribute Completion (Priority: P2)

**Goal**: Provide context-aware attribute suggestions based on the element type in createElement's first parameter

**Independent Test**: Type `createElement("img", { | })` and verify src, alt, width, height appear

### Tests for User Story 2

> **REQUIRED: Consult specs/TESTING_GUIDE.md. Use createTestContext() in beforeAll() per constitution XXIV.**

- [x] T023 [P] [US2] Write attribute completion tests in packages/language/src/completion/__tests__/html-elements.spec.ts (use createTestContext())
- [x] T024 [P] [US2] Test case: anchor attributes (href, target) appear for "a" element
- [x] T025 [P] [US2] Test case: image attributes (src, alt) appear for "img" element
- [x] T026 [P] [US2] Test case: input attributes (type, value) appear for "input" element
- [x] T027 [P] [US2] Test case: common attributes (id, className) appear for all elements
- [x] T028 [P] [US2] Test case: filtering works for partial attribute names

### Implementation for User Story 2

- [x] T029 [US2] Implement getElementAttributes() helper to combine element-specific + common attributes
- [x] T030 [US2] Implement provideAttributeNameCompletions() method in HTMLElementCompletionProvider
- [x] T031 [US2] Enhance context detection for object literal (inside `{ }` of second parameter) in packages/language/src/html/context-detection.ts
- [x] T032 [US2] Extract element name from first parameter for context-aware suggestions
- [x] T033 [US2] Add fallback to generic HTMLElement attributes for unknown/invalid elements
- [x] T034 [US2] Add AttributeName context handling in EligianCompletionProvider integration
- [x] T035 [US2] Verify all tests pass and manual testing works

**Checkpoint**: User Story 2 complete - attribute completion works based on element type

---

## Phase 5: User Story 3 - Attribute Value Completion (Priority: P3)

**Goal**: Provide value completions for enumerated attributes (e.g., input type, target, loading)

**Independent Test**: Type `createElement("input", { type: "|" })` and verify text, password, checkbox appear

### Tests for User Story 3

> **REQUIRED: Consult specs/TESTING_GUIDE.md. Use createTestContext() in beforeAll() per constitution XXIV.**

- [x] T036 [P] [US3] Write attribute value completion tests in packages/language/src/completion/__tests__/html-elements.spec.ts (use createTestContext())
- [x] T037 [P] [US3] Test case: input type values appear (text, password, checkbox, etc.)
- [x] T038 [P] [US3] Test case: anchor target values appear (_self, _blank, _parent, _top)
- [x] T039 [P] [US3] Test case: img loading values appear (eager, lazy)
- [x] T040 [P] [US3] Test case: no value completions for non-enum attributes (e.g., id, src)
- [x] T041 [P] [US3] Test case: filtering works for partial value text

### Implementation for User Story 3

- [x] T042 [US3] Implement getAttributeEnumValues() helper to retrieve enumValues from metadata
- [x] T043 [US3] Implement provideAttributeValueCompletions() method in HTMLElementCompletionProvider
- [x] T044 [US3] Add attribute value context detection (cursor inside property value string)
- [x] T045 [US3] Extract attribute name from enclosing property assignment
- [x] T046 [US3] Add AttributeValue context handling in EligianCompletionProvider integration
- [x] T047 [US3] Verify all tests pass and manual testing works

**Checkpoint**: User Story 3 complete - all three completion levels work together

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, edge cases, and quality assurance

- [x] T048 [P] Add graceful handling for invalid element names (no crash, no suggestions); include test for custom elements (e.g., "my-component") falling back to generic HTMLElement attributes
- [x] T049 [P] Add graceful handling for cursor outside valid completion positions
- [x] T050 [P] Ensure completion response time <100ms (per SC-004)
- [x] T051 [P] Run pnpm run check (Biome formatting/linting)
- [x] T052 [P] Run pnpm test to verify all tests pass (1 unrelated pre-existing failure in controller-hover.spec.ts)
- [x] T053 [P] Run pnpm run build to verify compilation
- [ ] T054 Validate quickstart.md examples work in VS Code extension

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - generates metadata file
- **Foundational (Phase 2)**: Depends on Setup - provides context detection
- **User Stories (Phase 3-5)**: All depend on Foundational completion
  - US1 (Element names): Depends on context detection + generated metadata
  - US2 (Attributes): Depends on US1 integration pattern
  - US3 (Values): Depends on US2 integration pattern
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational, benefits from US1 patterns but independently testable
- **User Story 3 (P3)**: Can start after Foundational, benefits from US2 patterns but independently testable

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Context detection before completion logic
- Core completion before integration
- Integration before manual testing

### Parallel Opportunities

- T001, T002 can run in parallel (different files)
- All test tasks within a story (T011-T015, T023-T028, T036-T041) can run in parallel
- T048-T054 polish tasks can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: T011 "Write element name completion tests"
Task: T012 "Test case: all 112 elements appear"
Task: T013 "Test case: filtering works with partial text"
Task: T014 "Test case: completions are sorted alphabetically"
Task: T015 "Test case: detail text shows HTML element"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (generate metadata)
2. Complete Phase 2: Foundational (context detection)
3. Complete Phase 3: User Story 1 (element name completion)
4. **STOP and VALIDATE**: Test element completion independently
5. Deploy/demo if ready - basic completion working

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Element names complete → Demo (MVP!)
3. Add User Story 2 → Attribute completion → Demo
4. Add User Story 3 → Value completion → Demo (Full feature!)
5. Each story adds value without breaking previous stories

### Single Developer Strategy

1. Complete Setup (T001-T005)
2. Complete Foundational (T006-T010)
3. Complete User Story 1 (T011-T022) → Verify working
4. Complete User Story 2 (T023-T035) → Verify working
5. Complete User Story 3 (T036-T047) → Verify working
6. Complete Polish (T048-T054)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD per constitution V)
- Run `pnpm run check` after each task (constitution XI)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
