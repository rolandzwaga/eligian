# Tasks: Code Completion for Eligian DSL

**Input**: Design documents from `/specs/002-code-completion-i/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Constitution Principle II (Comprehensive Testing) requires unit tests and integration tests for all production code. Test tasks are included throughout this task list.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
Based on plan.md structure (monorepo with 3 packages):
- **Language package**: `packages/language/src/`
- **Extension package**: `packages/extension/src/`
- **CLI package**: `packages/cli/src/`
- **Tests**: `packages/language/src/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and metadata generation infrastructure

- [x] T001 [P] [Setup] Create completion modules directory structure at `packages/language/src/completion/`
- [x] T002 [P] [Setup] Create metadata directory at `packages/extension/src/metadata/`
- [x] T003 [P] [Setup] Install additional dependencies if needed (ts-morph for TypeScript AST parsing, if not already present)
- [x] T004 [Setup] Run `npm run check` (Biome) to verify clean codebase before starting

**Checkpoint**: Directory structure ready for implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Metadata Generation Infrastructure

- [x] T005 [Foundational] Create PowerShell metadata generator script at `.specify/scripts/powershell/generate-metadata.ps1`
  - Parse Eligius operation metadata files from `../eligius/src/operation/metadata/*.ts`
  - Extract JSDoc comments, parameter metadata, dependencies, outputs
  - Generate TypeScript module at `packages/extension/src/metadata/operations.generated.ts`
  - Include FILTERED_OPERATIONS set (breakForEach, continueForEach, ifCondition, elseCondition, forEach)

- [x] T006 [Foundational] Add timeline event metadata extraction to generator script
  - Parse `../eligius/src/timeline-event-names.ts`
  - Extract JSDoc comments and event names
  - Generate TypeScript module at `packages/extension/src/metadata/timeline-events.generated.ts`

- [x] T007 [Foundational] Run metadata generator and verify generated files
  - Execute: `pwsh .specify/scripts/powershell/generate-metadata.ps1`
  - Verify `operations.generated.ts` contains all ~46 operations (✅ 45 operations generated)
  - Verify `timeline-events.generated.ts` contains all ~25 events (✅ 33 events generated)
  - Verify filtered operations are excluded

- [x] T008 [Foundational] Add `generate:registry` npm script to root package.json
  - Script: `"generate:registry": "pwsh .specify/scripts/powershell/generate-metadata.ps1"` ✅ Added

### Context Detection Module

- [x] T009 [P] [Foundational] Create context detection module at `packages/language/src/completion/context.ts`
  - Export `CompletionContext` interface (isInsideLoop, isInsideAction, isInsideEvent, etc.) ✅
  - Implement `detectContext(document, position)` function ✅
  - Use `AstUtils.getContainerOfType()` for AST traversal ✅
  - Use `CstUtils.findLeafNodeAtOffset()` for precise cursor node ✅

- [x] T010 [P] [Foundational] Write unit tests for context detection at `packages/language/src/__tests__/context.spec.ts`
  - Test detection of isInsideLoop context ✅
  - Test detection of isInsideAction context ✅
  - Test detection of isInsideEvent context ✅
  - Test detection of isAfterVariablePrefix context ✅
  - Ensure tests pass before proceeding ✅ (17/17 tests passing)

### Operation Registry Module

- [x] T011 [P] [Foundational] Create operation registry module at `packages/language/src/completion/registry.ts`
  - Import generated metadata from `packages/language/src/completion/metadata/operations.generated.ts` ✅
  - Implement `loadOperationRegistry()` with lazy loading (singleton pattern) ✅
  - Implement `getAllOperations()` - returns sorted, filtered list ✅
  - Implement `getOperation(name)` - returns specific operation metadata ✅
  - Implement `isFilteredOperation(name)` - checks FILTERED_OPERATIONS set ✅

- [x] T012 [P] [Foundational] Write unit tests for operation registry at `packages/language/src/__tests__/registry.spec.ts`
  - Test lazy loading (registry loaded once) ✅
  - Test getAllOperations returns filtered list ✅
  - Test getOperation returns correct metadata ✅
  - Test isFilteredOperation correctly identifies filtered operations ✅
  - Ensure tests pass ✅ (22/22 tests passing)

### Main Completion Provider

- [x] T013 [Foundational] Create main completion provider at `packages/language/src/eligian-completion-provider.ts`
  - Extend `DefaultCompletionProvider` from Langium ✅
  - Override `completionFor()` method ✅
  - Implement orchestration logic to call completion modules based on context ✅
  - Add graceful error handling (if metadata fails to load, log warning and continue) ✅

- [x] T014 [Foundational] Register completion provider in `packages/language/src/eligian-module.ts`
  - Add `CompletionProvider: EligianCompletionProvider` to `EligianAddedServices` type ✅
  - Register in `EligianModule` DI container: `CompletionProvider: services => new EligianCompletionProvider(services)` ✅

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Operation Name Completion (Priority: P1) 🎯 MVP

**Goal**: Enable completion of Eligius operation names with descriptions inside action blocks

**Independent Test**: Open `.eligian` file, type in action block (e.g., "sel"), verify operation completions appear alphabetically with descriptions

### Tests for User Story 1

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T015 [P] [US1] Write integration test for operation name completion at `packages/language/src/__tests__/completion.spec.ts`
  - Test: Type "sel" in action block → selectElement appears ✅
  - Test: Operation list is alphabetically sorted ✅
  - Test: Filtered operations (breakForEach, etc.) do NOT appear ✅
  - Test: Operation has description in documentation field ✅
  - Test: Operation has correct CompletionItemKind (Function) ✅
  - Verify tests FAIL (operation completion not implemented yet) ✅ (4 failed, 2 passed)

### Implementation for User Story 1

- [x] T016 [P] [US1] Create operation completion module at `packages/language/src/completion/operations.ts`
  - Export `getOperationCompletions(context: CompletionContext): CompletionItem[]` ✅
  - Load operation registry via `loadOperationRegistry()` → `getAllOperations()` ✅
  - Filter out operations in FILTERED_OPERATIONS set ✅ (done in registry)
  - Map each operation to CompletionItem: ✅
    - label: operation name ✅
    - kind: CompletionItemKind.Function ✅
    - sortText: `1_${operation.name}` (prefix ensures operations sort first) ✅
    - detail: "Eligius operation" ✅
    - documentation: markdown with description, parameters, outputs ✅

- [x] T017 [US1] Integrate operation completions into main provider at `packages/language/src/eligian-completion-provider.ts`
  - In `completionFor()`, detect if context.isInsideAction ✅
  - If true, call `getOperationCompletions(context)` and add to acceptor ✅
  - Ensure completions appear when typing in action blocks ✅

- [x] T018 [US1] Verify operation completion tests pass at `packages/language/src/__tests__/completion.spec.ts`
  - Run: `cd packages/language && pnpm test completion.spec.ts` ✅
  - All US1 tests should now pass ✅ (6/6 passing)
  - Fix any issues before proceeding ✅

- [x] T019 [US1] Run Biome checks: `npm run check`
  - Fix any formatting/linting issues ✅
  - Ensure 0 errors, 0 warnings ✅

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Custom Action Name Completion (Priority: P1)

**Goal**: Enable completion of custom actions defined in the current document alongside operations

**Independent Test**: Define custom actions in `.eligian` file (e.g., `action fadeIn`), type in action block, verify both operations and custom actions appear

### Tests for User Story 2

- [x] T020 [P] [US2] Write integration test for custom action completion at `packages/language/src/__tests__/completion.spec.ts`
  - Test: Define action `fadeIn`, type in action block → fadeIn appears ✅
  - Test: Both operations and custom actions appear together ✅
  - Test: Custom actions have CompletionItemKind.Class (to distinguish from operations) ✅
  - Test: Custom action shows parameter signature in detail ✅
  - Test: Forward references work (action defined after cursor) ✅
  - Verify tests FAIL initially ✅ (5 failed initially)

### Implementation for User Story 2

- [x] T021 [P] [US2] Create action completion module at `packages/language/src/completion/actions.ts`
  - Export `getActionCompletions(document: LangiumDocument): CompletionItem[]` ✅
  - Use `AstUtils.streamAllContents()` to find all ActionDefinition nodes ✅
  - Map each action to CompletionItem: ✅
    - label: action name ✅
    - kind: CompletionItemKind.Class (distinguishes from operations) ✅
    - sortText: `2_${action.name}` (sorts after operations) ✅
    - detail: Action parameter signature (e.g., "(selector, duration)") ✅
    - documentation: Action description ✅

- [x] T022 [US2] Integrate action completions into main provider at `packages/language/src/eligian-completion-provider.ts`
  - In `completionFor()`, if context.isInsideAction, call `getActionCompletions(document)` ✅
  - Actions appear alongside operations in completion list ✅

- [x] T023 [US2] Verify custom action completion tests pass
  - Run: `cd packages/language && pnpm test completion.spec.ts` ✅
  - All US2 tests should pass ✅ (11/11 passing: 6 US1 + 5 US2)

- [x] T024 [US2] Run Biome checks: `npm run check`
  - Fix any formatting/linting issues ✅
  - Ensure 0 errors, 0 warnings ✅

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently ✅

---

## Phase 5: User Story 3 - Keyword Completion (Priority: P2)

**Goal**: Enable context-aware completion of DSL keywords (action, event, if, else, for, break, continue)

**Independent Test**: Type in different contexts (top-level, action, loop) and verify appropriate keywords appear with context filtering

### Tests for User Story 3

- [ ] T025 [P] [US3] Write integration test for keyword completion at `packages/language/src/__tests__/completion.spec.ts`
  - Test: Top-level → `action`, `event` keywords appear
  - Test: Inside action → `if`, `else`, `for` keywords appear
  - Test: Inside loop → `break`, `continue` keywords appear
  - Test: Outside loop → `break`, `continue` do NOT appear
  - Test: Keywords have CompletionItemKind.Keyword
  - Verify tests FAIL initially

### Implementation for User Story 3

- [ ] T026 [P] [US3] Create keyword completion module at `packages/language/src/completion/keywords.ts`
  - Export `getKeywordCompletions(context: CompletionContext): CompletionItem[]`
  - Define keyword metadata array:
    - `{keyword: 'action', description: '...', contextFilter: 'topLevel'}`
    - `{keyword: 'if', description: '...', contextFilter: 'insideAction'}`
    - `{keyword: 'break', description: '...', contextFilter: 'insideLoop'}`
    - etc.
  - Filter keywords based on context flags (isInsideLoop, isInsideAction, etc.)
  - Map to CompletionItems:
    - label: keyword
    - kind: CompletionItemKind.Keyword
    - sortText: `0_${keyword}` (sorts before operations)
    - detail: Keyword description
    - documentation: Detailed explanation with usage examples

- [ ] T027 [US3] Integrate keyword completions into main provider at `packages/language/src/eligian-completion-provider.ts`
  - Call `getKeywordCompletions(context)` in all relevant contexts
  - Ensure keywords appear alongside operations/actions

- [ ] T028 [US3] Verify keyword completion tests pass
  - Run: `cd packages/language && pnpm test completion.spec.ts`
  - All US3 tests should pass

- [ ] T029 [US3] Run Biome checks: `npm run check`

**Checkpoint**: User Stories 1, 2, AND 3 now work independently

---

## Phase 6: User Story 4 - Timeline Event Name Completion (Priority: P2)

**Goal**: Enable completion of Eligius timeline event names when defining event handlers

**Independent Test**: Type `event ` and verify timeline event names appear with descriptions

### Tests for User Story 4

- [ ] T030 [P] [US4] Write integration test for event name completion at `packages/language/src/__tests__/completion.spec.ts`
  - Test: Type `event ` → timeline event names appear
  - Test: Event names are alphabetically sorted
  - Test: Events have CompletionItemKind.Event
  - Test: Events show descriptions from JSDoc
  - Test: Typing filters event list (e.g., "play" shows timeline-play, timeline-play-request)
  - Verify tests FAIL initially

### Implementation for User Story 4

- [ ] T031 [P] [US4] Create event completion module at `packages/language/src/completion/events.ts`
  - Export `getEventCompletions(context: CompletionContext): CompletionItem[]`
  - Import timeline events from `packages/extension/src/metadata/timeline-events.generated.ts`
  - Lazy load event registry (singleton pattern)
  - Map each event to CompletionItem:
    - label: event name (e.g., "timeline-play")
    - kind: CompletionItemKind.Event
    - sortText: event name (alphabetical)
    - detail: Event category (e.g., "requests", "announcements")
    - documentation: markdown with event description

- [ ] T032 [US4] Integrate event completions into main provider at `packages/language/src/eligian-completion-provider.ts`
  - Detect if context.isInsideEvent
  - If true, call `getEventCompletions(context)`

- [ ] T033 [US4] Verify event completion tests pass
  - Run: `cd packages/language && pnpm test completion.spec.ts`
  - All US4 tests should pass

- [ ] T034 [US4] Run Biome checks: `npm run check`

**Checkpoint**: User Stories 1-4 now work independently

---

## Phase 7: User Story 5 - Variable Reference Completion (Priority: P3)

**Goal**: Enable completion of variable references (@@currentItem, @@timeline, etc.) with type information

**Independent Test**: Type `@@` and verify variable references appear with type/scope information

### Tests for User Story 5

- [ ] T035 [P] [US5] Write integration test for variable reference completion at `packages/language/src/__tests__/completion.spec.ts`
  - Test: Type `@@` → variable references appear
  - Test: Inside loop → `@@currentItem`, `@@loopIndex`, `@@loopLength` appear
  - Test: Variables have CompletionItemKind.Variable
  - Test: Variables show type information in detail
  - Test: Scope filtering works (loop-specific variables only in loops)
  - Verify tests FAIL initially

### Implementation for User Story 5

- [ ] T036 [P] [US5] Create variable completion module at `packages/language/src/completion/variables.ts`
  - Export `getVariableCompletions(context: CompletionContext): CompletionItem[]`
  - Define variable metadata array:
    - `{name: 'currentItem', type: 'any', scope: 'loop', description: '...'}`
    - `{name: 'timeline', type: 'Timeline', scope: 'global', description: '...'}`
    - etc. (from data-model.md section 5)
  - Filter variables based on context.isInsideLoop (scope: 'loop' only in loops)
  - Map to CompletionItems:
    - label: `@@${variable.name}`
    - kind: CompletionItemKind.Variable
    - sortText: `var_${variable.name}`
    - detail: `${variable.type} (${variable.scope})`
    - documentation: variable description

- [ ] T037 [US5] Update context detection to detect `@@` prefix at `packages/language/src/completion/context.ts`
  - Add `isAfterVariablePrefix` flag to CompletionContext
  - Implement detection: check if previous 2 characters are "@@"

- [ ] T038 [US5] Integrate variable completions into main provider at `packages/language/src/eligian-completion-provider.ts`
  - If context.isAfterVariablePrefix, call `getVariableCompletions(context)`

- [ ] T039 [US5] Verify variable completion tests pass
  - Run: `cd packages/language && pnpm test completion.spec.ts`
  - All US5 tests should pass

- [ ] T040 [US5] Run Biome checks: `npm run check`

**Checkpoint**: User Stories 1-5 now work independently

---

## Phase 8: User Story 6 - Parameter Name Completion (Priority: P3)

**Goal**: Enable completion of parameter names inside operation/action calls with types and default values

**Independent Test**: Type inside operation call (e.g., `selectElement({s...}`) and verify parameter name completions appear

### Tests for User Story 6

- [ ] T041 [P] [US6] Write integration test for parameter completion at `packages/language/src/__tests__/completion.spec.ts`
  - Test: Type inside `selectElement({...})` → `selector`, `useSelectedElementAsRoot` appear
  - Test: Required parameters marked as required
  - Test: Parameters show types in detail (e.g., "selector: string")
  - Test: Optional parameters show default values
  - Test: Selecting parameter inserts `paramName: ` with cursor ready for value
  - Test: Custom action parameters work
  - Verify tests FAIL initially

### Implementation for User Story 6

- [ ] T042 [P] [US6] Create parameter completion module at `packages/language/src/completion/parameters.ts`
  - Export `getParameterCompletions(context: CompletionContext, operationName: string): CompletionItem[]`
  - Use operation registry to get parameter metadata
  - Map each parameter to CompletionItem:
    - label: parameter name
    - kind: CompletionItemKind.Property
    - sortText: `param_${required ? '0' : '1'}_${paramName}` (required params first)
    - detail: Format as `paramName: type` (e.g., "selector: string (required)")
    - detail: Include default value if present (e.g., "useSelectedElementAsRoot: boolean = false")
    - documentation: parameter description
    - insertText: `${paramName}: ` (ready for value input)

- [ ] T043 [US6] Update context detection to detect operation call context at `packages/language/src/completion/context.ts`
  - Add `insideOperationCall?: string` to CompletionContext
  - Detect if cursor is inside OperationCall AST node
  - Extract operation name for parameter lookup

- [ ] T044 [US6] Integrate parameter completions into main provider at `packages/language/src/eligian-completion-provider.ts`
  - If context.insideOperationCall is set, call `getParameterCompletions(context, operationName)`

- [ ] T045 [US6] Verify parameter completion tests pass
  - Run: `cd packages/language && pnpm test completion.spec.ts`
  - All US6 tests should pass

- [ ] T046 [US6] Run Biome checks: `npm run check`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T047 [P] [Polish] Add JSDoc comments to all completion modules (operations.ts, actions.ts, keywords.ts, events.ts, variables.ts, parameters.ts)
  - Document module purpose
  - Document function parameters and return types
  - Include usage examples

- [ ] T048 [P] [Polish] Update quickstart.md with actual implementation examples
  - Replace placeholder examples with real code from implementation
  - Add debugging tips specific to Eligian completion provider
  - Add performance profiling examples

- [ ] T049 [P] [Polish] Performance optimization: Add timing logs to completion provider
  - Log completion computation time
  - Verify <100ms target (SC-002 from spec.md)
  - Optimize if needed (add more caching, limit items, etc.)

- [ ] T050 [P] [Polish] Add error handling for edge cases (from spec.md Edge Cases section)
  - Graceful degradation if registry fails to load
  - Handle missing descriptions (show item without docs)
  - Handle multiple actions with same name (add scope qualifiers)

- [ ] T051 [Polish] Run full test suite: `cd packages/language && pnpm test`
  - All tests should pass (298 existing + ~25 new completion tests = ~323 total)
  - Fix any regressions

- [ ] T052 [Polish] Update CLAUDE.md with completion provider implementation notes
  - Add completion provider patterns to project guidance
  - Document metadata generation workflow
  - Add troubleshooting section for common completion issues

- [ ] T053 [Polish] Final Biome check: `npm run check`
  - Ensure clean codebase (0 errors, 0 warnings)
  - Fix any issues

- [ ] T054 [Polish] Manual testing in VS Code Extension Development Host
  - Open extension (F5)
  - Create test.eligian file
  - Verify all 6 user stories work as expected
  - Test edge cases
  - Document any issues found

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-8)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P1 → P2 → P2 → P3 → P3)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Independent of US1 (but both often used together)
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Independent of US1/US2
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Independent of US1-3
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Independent of US1-4
- **User Story 6 (P3)**: Can start after Foundational (Phase 2) - Depends on US1 (uses operation registry)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Completion module before integration with main provider
- Integration before verification tests pass
- Tests pass before Biome checks
- Biome checks clean before story considered complete

### Parallel Opportunities

- All Setup tasks (T001-T004) can run in parallel
- All Foundational tests (T010, T012) can run in parallel (different files)
- Foundational modules (T009, T011, T013) can run in sequence or parallel if team capacity allows
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story can run in parallel (different test files)
- All completion modules can be developed in parallel (different files)
- Polish tasks (T047-T050, T052) can run in parallel (different files)

---

## Parallel Example: Foundational Phase

```bash
# Launch foundational tasks in parallel (after T005-T008 metadata generation):
Task: "Create context detection module at packages/language/src/completion/context.ts"
Task: "Write unit tests for context detection at packages/language/src/__tests__/context.spec.ts"
Task: "Create operation registry module at packages/language/src/completion/registry.ts"
Task: "Write unit tests for operation registry at packages/language/src/__tests__/registry.spec.ts"
```

## Parallel Example: User Story 1

```bash
# Launch US1 tasks in parallel:
Task: "Write integration test for operation name completion" (T015)
Task: "Create operation completion module" (T016)

# Then sequentially:
Task: "Integrate operation completions into main provider" (T017)
Task: "Verify operation completion tests pass" (T018)
Task: "Run Biome checks" (T019)
```

## Parallel Example: Multiple User Stories

```bash
# After Foundational phase completes, launch all user stories in parallel:
Team Member A: Work on User Story 1 (T015-T019)
Team Member B: Work on User Story 2 (T020-T024)
Team Member C: Work on User Story 3 (T025-T029)

# Each story is independent and can be completed without blocking others
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T014) - **CRITICAL**
3. Complete Phase 3: User Story 1 (T015-T019) - Operation completions
4. Complete Phase 4: User Story 2 (T020-T024) - Action completions
5. **STOP and VALIDATE**: Test US1 and US2 together - operations and actions both work
6. Deploy/demo if ready (MVP with most valuable features!)

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (Operations work!)
3. Add User Story 2 → Test independently → Deploy/Demo (Operations + Actions!)
4. Add User Story 3 → Test independently → Deploy/Demo (+ Keywords!)
5. Add User Story 4 → Test independently → Deploy/Demo (+ Events!)
6. Add User Story 5 → Test independently → Deploy/Demo (+ Variables!)
7. Add User Story 6 → Test independently → Deploy/Demo (+ Parameters - complete!)
8. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers (after Foundational phase):

1. Team completes Setup + Foundational together (T001-T014)
2. Once Foundational is done:
   - Developer A: User Story 1 (T015-T019)
   - Developer B: User Story 2 (T020-T024)
   - Developer C: User Story 3 (T025-T029)
3. Stories complete and integrate independently
4. Continue with remaining stories (US4-6) in parallel

---

## Notes

- **[P] tasks** = different files, no dependencies
- **[Story] label** maps task to specific user story for traceability
- **Each user story** should be independently completable and testable
- **Verify tests fail** before implementing (TDD approach)
- **Constitution Principle XI**: Run `npm run check` (Biome) after each task or logical group
- **Constitution Principle II**: All tests must pass before moving on
- **Commit** after each task or logical group
- **Stop at any checkpoint** to validate story independently
- **Avoid**: vague tasks, same file conflicts, cross-story dependencies that break independence

## Total Task Count

- **Setup**: 4 tasks
- **Foundational**: 10 tasks (T005-T014)
- **User Story 1**: 5 tasks (T015-T019)
- **User Story 2**: 5 tasks (T020-T024)
- **User Story 3**: 5 tasks (T025-T029)
- **User Story 4**: 5 tasks (T030-T034)
- **User Story 5**: 6 tasks (T035-T040)
- **User Story 6**: 6 tasks (T041-T046)
- **Polish**: 8 tasks (T047-T054)

**Total**: 54 tasks

## Suggested MVP Scope

**Recommended MVP**: User Stories 1 & 2 only (T001-T024)
- **Rationale**: Operations and actions are the most frequently typed elements (both P1 priority)
- **Value**: 95% reduction in documentation lookups (SC-001)
- **Tasks**: 24 tasks total (Setup + Foundational + US1 + US2)
- **Independent Test**: Type in action block → see operations and custom actions with descriptions
- **Deliverable**: Fully functional code completion for operations and actions, ready for VS Code extension deployment
