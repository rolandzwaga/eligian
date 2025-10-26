# Tasks: CSS IDE Features

**Input**: Design documents from `/specs/014-css-ide-features/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Test tasks are included per Constitution Principle II (TDD required)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions
- Language package: `packages/language/src/`
- Extension package: `packages/extension/src/`
- Tests: `packages/language/src/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify project structure and Feature 013 dependencies

- [ ] T001 Verify Feature 013 CSSRegistryService is available and functional
- [ ] T002 Verify existing provider structure (`packages/language/src/completion/`, `hover/`, `code-actions/`)
- [ ] T003 [P] Create test directory structure `packages/language/src/__tests__/css-ide-features/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities and context detection logic that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 [P] Create completion context detection module `packages/language/src/css/context-detection.ts`
  - Implement `detectCompletionContext(context: CompletionContext): CompletionContextType`
  - Enum: `CompletionContextType { None, ClassName, SelectorClass, SelectorID }`
  - Detects cursor position in string literals, parent operation type
- [ ] T005 [P] Create hover target detection module `packages/language/src/css/hover-detection.ts`
  - Implement `detectHoverTarget(node: AstNode, params: HoverParams): HoverTarget | undefined`
  - Interface: `HoverTarget { type: 'class' | 'id', name: string }`
  - Parses selectors using Feature 013's `parseSelectorString`
- [ ] T006 [P] Create code action helpers `packages/language/src/css/code-action-helpers.ts`
  - Implement `extractClassNameFromDiagnostic(diagnostic: Diagnostic): string | undefined`
  - Implement `createCSSClassEdit(cssFilePath: string, className: string): WorkspaceEdit`
  - Constants: `CSS_RELATED_CODES = ['css-unknown-class', 'css-unknown-id', ...]`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Autocomplete CSS Classes in Parameters (Priority: P1) 🎯 MVP

**Goal**: Provide autocomplete suggestions for CSS class names in `addClass()`, `removeClass()`, `toggleClass()` operations

**Independent Test**: Type `addClass("")` with cursor between quotes, verify CSS classes from imported files appear in autocomplete menu

### Tests for User Story 1 (TDD - Write FIRST, ensure they FAIL)

- [ ] T007 [P] [US1] Unit test: Context detection for className parameters
  - File: `packages/language/src/__tests__/css-ide-features/context-detection.spec.ts`
  - Test `detectCompletionContext` returns `ClassName` for `addClass("")` with cursor inside quotes
  - Test returns `None` for non-operation contexts
  - Test returns `None` when no CSS imports
- [ ] T008 [P] [US1] Unit test: CSS class completion provider
  - File: `packages/language/src/__tests__/css-ide-features/completion.spec.ts`
  - Test `provideCSSClassCompletions` generates items for all CSS classes
  - Test completion items have correct structure (label, kind, sortText, detail)
  - Test sortText prefix `"0_"` ranks CSS items first
  - Test filtering by prefix (e.g., "bu" shows only classes starting with "bu")
- [ ] T009 [P] [US1] Integration test: E2E completion in className parameters
  - File: `packages/language/src/__tests__/integration/css-completion-classname.spec.ts`
  - **IMPORTANT**: One integration test per file (Constitution Principle II)
  - Test full LSP completion request with `.eligian` file importing CSS
  - Verify completion list includes CSS classes
  - Verify detail text shows "CSS class"
  - **IMPORTANT**: Manually populate CSSRegistry in test setup

### Implementation for User Story 1

- [ ] T010 [US1] Implement `CSSCompletionProvider.provideCSSClassCompletions()` method
  - File: `packages/language/src/css/css-completion.ts`
  - Query `CSSRegistry.getAllClasses(documentUri)`
  - Generate `CompletionItem` for each class with:
    - `kind: CompletionItemKind.Property`
    - `sortText: "0_" + className`
    - `detail: "CSS class"`
  - Return via `CompletionAcceptor`
- [ ] T011 [US1] Integrate CSS completion into `EligianCompletionProvider`
  - File: `packages/language/src/completion/eligian-completion-provider.ts`
  - Import `CSSCompletionProvider`
  - In `provideCompletion`, detect context with `detectCompletionContext`
  - If context is `ClassName`, call `cssProvider.provideCSSClassCompletions`
  - Ensure CSS completions don't block other completions
- [ ] T012 [US1] Verify completion provider registration in module
  - File: `packages/language/src/eligian-module.ts` (or similar)
  - Ensure `CompletionProvider` service is registered
  - No changes needed if already registered in Feature 013

**Checkpoint**: User Story 1 complete - CSS class autocomplete works in className parameters

---

## Phase 4: User Story 2 - Hover to See CSS Definitions (Priority: P2)

**Goal**: Show CSS file location and rule preview when hovering over class names in code

**Independent Test**: Hover over `"button"` in `addClass("button")`, verify tooltip shows file location and CSS rule preview

### Tests for User Story 2 (TDD - Write FIRST, ensure they FAIL)

- [ ] T013 [P] [US2] Unit test: Hover target detection
  - File: `packages/language/src/__tests__/css-ide-features/hover-detection.spec.ts`
  - Test `detectHoverTarget` identifies class names in `addClass("button")`
  - Test handles compound selectors `.button.primary` (identifies hovered class only)
  - Test returns `undefined` for non-CSS contexts
- [ ] T014 [P] [US2] Unit test: CSS hover provider
  - File: `packages/language/src/__tests__/css-ide-features/hover.spec.ts`
  - Test `provideCSSClassHover` generates markdown with file location
  - Test markdown includes CSS rule preview in code fence
  - Test handles multiple definitions (class in multiple CSS files)
  - Test returns `undefined` when class doesn't exist
- [ ] T015 [P] [US2] Integration test: E2E hover in className parameters
  - File: `packages/language/src/__tests__/integration/css-hover-classname.spec.ts`
  - **IMPORTANT**: One integration test per file (Constitution Principle II)
  - Test full LSP hover request returns markdown content
  - Verify markdown format matches template
  - **IMPORTANT**: Manually populate CSSRegistry in test setup

### Implementation for User Story 2

- [ ] T016 [US2] Implement `CSSHoverProvider.provideCSSClassHover()` method
  - File: `packages/language/src/css/css-hover.ts`
  - Use `detectHoverTarget` to identify hovered class
  - Query `CSSRegistry.getClassInfo(className, documentUri)`
  - Generate markdown content with:
    - Header: `**CSS Class**: \`className\``
    - Location: `Defined in: filePath:lineNumber`
    - Preview: `\`\`\`css\n...\n\`\`\``
  - Return `Hover` with `MarkupKind.Markdown`
- [ ] T017 [US2] Implement `CSSHoverProvider.provideCSSIDHover()` method
  - File: `packages/language/src/css/css-hover.ts`
  - Similar to `provideCSSClassHover` but for IDs
  - Query `CSSRegistry.getIDInfo(idName, documentUri)`
  - Generate markdown with "CSS ID" header
- [ ] T018 [US2] Create or integrate hover provider
  - File: `packages/language/src/hover/eligian-hover-provider.ts` (create if missing)
  - Extend `AstNodeHoverProvider` base class
  - Override `getAstNodeHoverContent(node, params)`
  - Instantiate `CSSHoverProvider` and delegate to it for CSS contexts
  - Return CSS hover or call `super.getAstNodeHoverContent` for non-CSS
- [ ] T019 [US2] Register hover provider in module
  - File: `packages/language/src/eligian-module.ts` (or similar)
  - Add `HoverProvider` to module services
  - Inject `CSSRegistryService` dependency

**Checkpoint**: User Story 2 complete - Hover shows CSS definitions and previews

---

## Phase 5: User Story 3 - Autocomplete in Selector Strings (Priority: P2)

**Goal**: Provide autocomplete for classes (after `.`) and IDs (after `#`) in `selectElement()` selectors

**Independent Test**: Type `selectElement(".")` with cursor after dot, verify CSS class names appear without dot prefix

### Tests for User Story 3 (TDD - Write FIRST, ensure they FAIL)

- [ ] T020 [P] [US3] Unit test: Selector context detection
  - File: `packages/language/src/__tests__/css-ide-features/context-detection.spec.ts`
  - Test `detectCompletionContext` returns `SelectorClass` after `.` in `selectElement(".")`
  - Test returns `SelectorID` after `#` in `selectElement("#")`
  - Test handles compound selectors `.button.|` (cursor after second dot)
  - Test filters by prefix `.butt|` (cursor at end)
- [ ] T021 [P] [US3] Unit test: Selector completion provider
  - File: `packages/language/src/__tests__/css-ide-features/completion.spec.ts`
  - Test `provideSelectorCompletions` for classes (after `.`)
  - Test `provideSelectorCompletions` for IDs (after `#`)
  - Test completion items don't include dot/hash prefix in insertText
  - Test sortText ranks CSS items first
- [ ] T022 [P] [US3] Integration test: E2E selector completion
  - File: `packages/language/src/__tests__/integration/css-completion-selector.spec.ts`
  - **IMPORTANT**: One integration test per file (Constitution Principle II)
  - Test completion in `selectElement(".")` shows CSS classes
  - Test completion in `selectElement("#")` shows CSS IDs
  - **IMPORTANT**: Manually populate CSSRegistry in test setup

### Implementation for User Story 3

- [ ] T023 [US3] Implement `CSSCompletionProvider.provideSelectorCompletions()` method
  - File: `packages/language/src/css/css-completion.ts`
  - Accept `selectorType: 'class' | 'id'` parameter
  - For classes: Query `CSSRegistry.getAllClasses(documentUri)`
  - For IDs: Query `CSSRegistry.getAllIDs(documentUri)`
  - Generate `CompletionItem` without dot/hash prefix in label
  - Return via `CompletionAcceptor`
- [ ] T024 [US3] Extend context detection for selector prefixes
  - File: `packages/language/src/css/context-detection.ts`
  - Add logic to detect `.` or `#` before cursor in selector strings
  - Calculate relative offset within string literal
  - Parse `textBeforeCursor` to identify prefix
- [ ] T025 [US3] Integrate selector completion into `EligianCompletionProvider`
  - File: `packages/language/src/completion/eligian-completion-provider.ts`
  - In `provideCompletion`, detect `SelectorClass` or `SelectorID` context
  - Call `cssProvider.provideSelectorCompletions` with appropriate type
  - Ensure selector completions work alongside className completions

**Checkpoint**: User Story 3 complete - Selector autocomplete works for classes and IDs

---

## Phase 6: User Story 4 - Quick Fix to Create Missing CSS Classes (Priority: P3)

**Goal**: Provide code action to create missing CSS class in first imported CSS file

**Independent Test**: Use unknown class `"new-class"`, trigger quick fix, verify class created in CSS file with TODO comment

### Tests for User Story 4 (TDD - Write FIRST, ensure they FAIL)

- [ ] T026 [P] [US4] Unit test: Extract class name from diagnostic
  - File: `packages/language/src/__tests__/css-ide-features/code-actions.spec.ts`
  - Test `extractClassNameFromDiagnostic` parses "Unknown CSS class 'foo'" → "foo"
  - Test returns `undefined` for non-CSS diagnostics
- [ ] T027 [P] [US4] Unit test: Create CSS class WorkspaceEdit
  - File: `packages/language/src/__tests__/css-ide-features/code-actions.spec.ts`
  - Test `createCSSClassEdit` generates valid `WorkspaceEdit`
  - Test edit appends at end of file (range at last line)
  - Test newText contains `.className { /* TODO: Add styles */ }`
- [ ] T028 [P] [US4] Unit test: Code action provider
  - File: `packages/language/src/__tests__/css-ide-features/code-actions.spec.ts`
  - Test `provideCreateClassAction` returns `CodeAction` for CSS errors
  - Test action has title like "Create '.foo' in styles.css"
  - Test `kind` is `CodeActionKind.QuickFix`
  - Test `diagnostics` links to specific error
- [ ] T029 [P] [US4] Integration test: E2E code action application
  - File: `packages/language/src/__tests__/integration/css-codeaction-quickfix.spec.ts`
  - **IMPORTANT**: One integration test per file (Constitution Principle II)
  - Test code action request returns quick fix
  - Test applying edit creates CSS class in file (mock file system)
  - **IMPORTANT**: Mock CSS file system for test

### Implementation for User Story 4

- [ ] T030 [US4] Implement `CSSCodeActionProvider.provideCreateClassAction()` method
  - File: `packages/language/src/css/css-code-actions.ts`
  - Filter `params.context.diagnostics` for CSS_RELATED_CODES
  - For each CSS error: Extract class name, get imported CSS files
  - If CSS files available: Create `CodeAction` with `WorkspaceEdit`
  - Use `createCSSClassEdit` helper to generate edit
  - Return `CodeAction[]`
- [ ] T031 [US4] Implement CSS class edit generation
  - File: `packages/language/src/css/code-action-helpers.ts`
  - Already created in T006, now implement:
  - Read CSS file to determine last line number
  - Create `TextEdit` with range at end of file
  - Generate newText: `\n.${className} {\n  /* TODO: Add styles */\n}\n`
  - Return `WorkspaceEdit` with changes map
- [ ] T032 [US4] Create or integrate code action provider
  - File: `packages/language/src/code-actions/eligian-code-action-provider.ts` (create if missing)
  - Implement `CodeActionProvider` interface
  - Implement `getCodeActions(document, params)`
  - Instantiate `CSSCodeActionProvider` and delegate for CSS errors
  - Return combined code actions
- [ ] T033 [US4] Register code action provider in module
  - File: `packages/language/src/eligian-module.ts` (or similar)
  - Add `CodeActionProvider` to module services
  - Inject `CSSRegistryService` dependency
- [ ] T034 [US4] Verify code action provider in extension
  - File: `packages/extension/src/language/main.ts`
  - Ensure language server has code action capabilities enabled
  - No changes needed if already enabled

**Checkpoint**: User Story 4 complete - Quick fix creates missing CSS classes

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, documentation, and quality checks

- [ ] T035 [P] Run Biome format and lint check (`pnpm run check`)
- [ ] T036 [P] Run TypeScript type checking (`pnpm run typecheck`)
- [ ] T037 [P] Verify test coverage meets 80% threshold (`pnpm run test:coverage`)
- [ ] T038 Update LANGUAGE_SPEC.md if any DSL syntax affected (likely N/A for this feature)
- [ ] T039 [P] Manual E2E testing: Test all 4 user stories in running VS Code extension
  - US1: Autocomplete in `addClass("")`
  - US2: Hover over class names
  - US3: Autocomplete in `selectElement(".")`
  - US4: Quick fix for unknown class
- [ ] T040 [P] Performance verification: Test with 1000+ CSS classes, verify <100ms latency
- [ ] T041 Document any known issues or edge cases in quickstart.md
- [ ] T042 Final constitution compliance check (verify all principles met)

---

## Task Summary

**Total Tasks**: 42
**Test Tasks**: 12 (TDD approach)
**Implementation Tasks**: 24
**Integration/Polish Tasks**: 6

### Tasks by User Story

- **Setup**: 3 tasks (T001-T003)
- **Foundation**: 3 tasks (T004-T006)
- **US1 (P1)**: 6 tasks (T007-T012) - Autocomplete in className parameters
- **US2 (P2)**: 7 tasks (T013-T019) - Hover tooltips
- **US3 (P2)**: 6 tasks (T020-T025) - Autocomplete in selectors
- **US4 (P3)**: 9 tasks (T026-T034) - Quick fix actions
- **Polish**: 8 tasks (T035-T042)

### Parallel Opportunities

**Foundation Phase** (All can run in parallel):
- T004, T005, T006 (different files)

**User Story 1**:
- T007, T008, T009 (test files - parallel)
- T010, T011, T012 (sequential - depend on each other)

**User Story 2**:
- T013, T014, T015 (test files - parallel)
- T016, T017, T018, T019 (sequential - depend on each other)

**User Story 3**:
- T020, T021, T022 (test files - parallel)
- T023, T024, T025 (sequential - depend on each other)

**User Story 4**:
- T026, T027, T028, T029 (test files - parallel)
- T030, T031, T032, T033, T034 (sequential - depend on each other)

**Polish**:
- T035, T036, T037, T039, T040, T041 (mostly parallel)

---

## Dependencies & Story Completion Order

### Story Dependencies

```
Foundation (T004-T006)
    ↓
US1 (T007-T012) ← MVP / P1
    ↓ (optional - US2 and US3 can run in parallel)
    ├─→ US2 (T013-T019) ← P2
    └─→ US3 (T020-T025) ← P2
            ↓
        US4 (T026-T034) ← P3 (depends on US1 validation errors)
```

### Critical Path

1. **Foundation** (T004-T006): Must complete first
2. **US1** (T007-T012): MVP, highest priority
3. **US2 & US3** (T013-T025): Can implement in parallel after US1
4. **US4** (T026-T034): Requires US1 validation infrastructure
5. **Polish** (T035-T042): Final integration

### Independent Story Testing

Each user story has **independent test criteria**:

**US1 (MVP)**: Type `addClass("")`, see CSS classes in autocomplete
- **Deliverable**: Functional autocomplete for className parameters
- **Test**: Create `.eligian` file with CSS import, verify completion works

**US2**: Hover over `"button"` in code, see CSS definition tooltip
- **Deliverable**: Functional hover with file location and CSS preview
- **Test**: Hover over class name, verify markdown tooltip appears

**US3**: Type `selectElement(".")`, see CSS classes without dot prefix
- **Deliverable**: Functional autocomplete in selector strings
- **Test**: Type `.` or `#` in selector, verify completions appear

**US4**: Use unknown class, click quick fix, verify class created in CSS
- **Deliverable**: Functional code action to create missing classes
- **Test**: Use unknown class, apply quick fix, verify CSS file updated

---

## Parallel Execution Examples

### Example 1: Foundation Phase (Maximum Parallelism)

```bash
# All foundation tasks can run in parallel (different files)
Developer 1: T004 (context-detection.ts)
Developer 2: T005 (hover-detection.ts)
Developer 3: T006 (code-action-helpers.ts)
```

### Example 2: User Story 1 Tests (Parallel)

```bash
# All US1 tests can run in parallel (different test files)
Developer 1: T007 (context-detection.spec.ts)
Developer 2: T008 (completion.spec.ts)
Developer 3: T009 (integration test)
```

### Example 3: Multiple Stories in Parallel

```bash
# After US1 complete, US2 and US3 can proceed in parallel
Team A: T013-T019 (User Story 2 - Hover)
Team B: T020-T025 (User Story 3 - Selector Completion)
```

---

## Implementation Strategy

### MVP Scope (Minimum Viable Product)

**Recommended MVP**: User Story 1 only (T001-T012)
- Provides core value: CSS class autocomplete in className parameters
- Independently testable and deliverable
- Foundation for other stories

### Incremental Delivery

1. **Sprint 1**: Foundation + US1 (T001-T012)
   - Delivers MVP: Autocomplete in className parameters
   - Independent value: Developers can complete CSS classes faster

2. **Sprint 2**: US2 + US3 (T013-T025)
   - Delivers: Hover tooltips + Selector autocomplete
   - Independent value: Better code comprehension + selector building

3. **Sprint 3**: US4 + Polish (T026-T042)
   - Delivers: Quick fix for missing classes + final polish
   - Independent value: Rapid prototyping workflow

### Testing Strategy

Per Constitution Principle II, follow TDD workflow:
1. **RED**: Write failing test (e.g., T007)
2. **GREEN**: Implement minimum code to pass (e.g., T010)
3. **REFACTOR**: Improve code quality while tests stay green

**Coverage Target**: 80% for all business logic
- Providers: 100% coverage (pure functions, easy to test)
- Context detection: 100% coverage (critical logic)
- Integration tests: Cover happy paths and edge cases

### Performance Validation

After implementation, verify performance targets:
- Autocomplete: <100ms from trigger to suggestions
- Hover: <50ms from hover to tooltip
- Quick fix: <1s from click to CSS file updated
- Load test: 1000+ CSS classes without degradation

---

## Notes

- **Feature 013 Dependency**: This feature critically depends on CSSRegistryService from Feature 013. Verify Feature 013 is complete before starting.
- **Langium Version**: Ensure Langium 3.x is installed and compatible
- **Test Isolation**: Each test must manually populate CSSRegistry (it's not automatically loaded in tests)
- **File Paths**: All paths assume monorepo structure with `packages/language/` and `packages/extension/`
- **Biome Compliance**: Run `pnpm run check` after each task to maintain code quality
- **TypeScript Types**: Run `pnpm run typecheck` frequently to catch type errors early
