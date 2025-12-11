# Tasks: Eligius 2.0.0 API Migration

**Input**: Design documents from `/specs/044-eligius-api-migration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, quickstart.md

**Tests**: No new tests required - existing test suite serves as regression validation (per spec.md).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo structure**: `packages/extension/`, `packages/cli/`, `packages/language/`
- Affected files:
  - `packages/extension/media/preview.ts` (US1, US3)
  - `packages/cli/src/bundler/runtime-bundler.ts` (US2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify Eligius 2.1.0 is installed and understand the migration scope

- [x] T001 Verify Eligius 2.1.0 is installed by running `pnpm list eligius`
- [x] T002 Review IEngineFactoryResult interface in Eligius types documentation

**Checkpoint**: Prerequisites verified - ready for implementation

---

## Phase 2: User Story 1 - Preview Panel Engine Lifecycle (Priority: P1) - MVP

**Goal**: Update the VS Code preview panel to use the new Eligius 2.0.0 API for engine creation and destruction

**Independent Test**: Open a `.eligian` file, trigger preview command, verify engine initializes. Close panel, verify no console errors. Open different file in same panel, verify clean transition.

### Implementation for User Story 1

- [x] T003 [US1] Add `IEngineFactoryResult` to imports from `eligius` in packages/extension/media/preview.ts
- [x] T004 [US1] Add `let factoryResult: IEngineFactoryResult | null = null;` state variable after line 41 in packages/extension/media/preview.ts
- [x] T005 [US1] Update `initializeEngine()` to destructure factory result and store in `factoryResult` in packages/extension/media/preview.ts
- [x] T006 [US1] Update cleanup logic in `initializeEngine()` (lines 54-57) to check `factoryResult` and call `factoryResult.destroy()` in packages/extension/media/preview.ts
- [x] T007 [US1] Update `destroyEngine()` function to use `factoryResult.destroy()` instead of `engine.destroy()` in packages/extension/media/preview.ts
  - **Note (FR-007)**: Implementation MUST be idempotent - check `if (factoryResult)` before calling destroy to handle repeated calls gracefully (edge case: destroy on already-destroyed engine)

**Checkpoint**: Preview panel engine lifecycle should work correctly with new API

---

## Phase 3: User Story 2 - CLI Runtime Bundle Generation (Priority: P2)

**Goal**: Update the generated runtime bundle code to use the new Eligius 2.0.0 API for engine creation

**Independent Test**: Run CLI bundle command on a sample `.eligian` file, inspect generated JavaScript, verify destructuring syntax is correct.

### Implementation for User Story 2

- [x] T008 [P] [US2] Update generated engine assignment in `generateEntryPoint()` function (line 173) to use destructuring `const { engine } = factory.createEngine(CONFIG);` in packages/cli/src/bundler/runtime-bundler.ts

**Checkpoint**: Generated bundles should use correct Eligius 2.0.0 API

---

## Phase 4: User Story 3 - Engine Playback Controls (Priority: P3)

**Goal**: Verify playback controls continue to work with the new adapter-based eventbus integration

**Independent Test**: Use preview panel controls (play/pause/stop/restart), verify timeline responds correctly to all commands.

### Implementation for User Story 3

> **Note**: US3 requires no code changes - playback controls use eventbus events which remain unchanged in Eligius 2.0.0. This phase is verification only.

- [ ] T009 [US3] Manual verification: Test play button in preview panel
- [ ] T010 [US3] Manual verification: Test pause button in preview panel
- [ ] T011 [US3] Manual verification: Test stop button in preview panel
- [ ] T012 [US3] Manual verification: Test restart button in preview panel

**Checkpoint**: All playback controls should function correctly

---

## Phase 5: Verification & Quality Gates

**Purpose**: Verify all changes pass quality gates and existing tests

- [x] T013 Run `pnpm run build` and verify TypeScript compilation succeeds
- [x] T014 Run `pnpm run check` and verify Biome linting passes (0 errors, 0 warnings)
- [x] T015 Run `pnpm test` and verify all existing tests pass
- [ ] T016 Manual verification: Open/close preview panel multiple times, verify no memory leaks or console errors
  - **Verification steps (SC-002)**:
    1. Open Chrome DevTools in webview (Help → Toggle Developer Tools)
    2. Go to Memory tab, take heap snapshot before opening preview
    3. Open preview panel, wait for engine init, close panel
    4. Repeat open/close cycle 3-5 times
    5. Take final heap snapshot, compare to baseline
    6. Check Console tab for any error messages during cycles
    7. Pass criteria: No retained engine objects, no console errors

**Checkpoint**: All quality gates passed - migration complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **US1 (Phase 2)**: Depends on Setup completion
- **US2 (Phase 3)**: Can run in parallel with US1 (different files)
- **US3 (Phase 4)**: Depends on US1 completion (uses preview panel)
- **Verification (Phase 5)**: Depends on US1 and US2 completion

### User Story Dependencies

- **User Story 1 (P1)**: Independent - primary implementation
- **User Story 2 (P2)**: Independent - can run in parallel with US1 (different file)
- **User Story 3 (P3)**: Depends on US1 (verification of preview panel functionality)

### Task Dependencies

```
T001, T002 (Setup)
    ↓
T003 → T004 → T005 → T006 → T007 (US1 - sequential, same file)
    ↓                              ↘
T008 (US2 - parallel with US1)      T009-T012 (US3 - after US1)
    ↓                              ↙
T013 → T014 → T015 → T016 (Verification - after US1 & US2)
```

### Parallel Opportunities

- **T003-T007** (US1) and **T008** (US2) can run in parallel (different files)
- **T009-T012** (US3 verification) can run in parallel (independent manual tests)

---

## Parallel Example: US1 and US2

```bash
# These can run in parallel (different files):
# Developer A: US1 tasks (preview.ts)
# Developer B: US2 task (runtime-bundler.ts)

# US1: packages/extension/media/preview.ts
Task: "T003 [US1] Add IEngineFactoryResult import"
Task: "T004 [US1] Add factoryResult state variable"
Task: "T005 [US1] Update initializeEngine() destructuring"
Task: "T006 [US1] Update initializeEngine() cleanup logic"
Task: "T007 [US1] Update destroyEngine() function"

# US2: packages/cli/src/bundler/runtime-bundler.ts (PARALLEL)
Task: "T008 [US2] Update generateEntryPoint() destructuring"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: User Story 1 (T003-T007)
3. **STOP and VALIDATE**: Test preview panel independently
4. Continue to US2 and US3

### Incremental Delivery

1. Setup → Ready
2. User Story 1 → Preview panel works with new API (MVP!)
3. User Story 2 → CLI bundles use new API
4. User Story 3 → Verify playback controls
5. Verification → All quality gates pass

### Single Developer Strategy

Execute in order: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009-T012 → T013-T016

Total estimated time: ~30 minutes for implementation + verification

---

## Notes

- This is a minimal API migration with only 2 files requiring changes
- No new tests needed - existing tests validate backwards compatibility
- US3 requires no code changes - verification only
- [P] tasks = different files, can run in parallel
- Commit after completing each user story phase
- Verify each checkpoint before proceeding
