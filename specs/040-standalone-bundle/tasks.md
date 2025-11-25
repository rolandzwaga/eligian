# Tasks: Standalone Bundle Compilation

**Input**: Design documents from `/specs/040-standalone-bundle/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are included (TDD approach per Constitution Principle V)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/cli/src/` for bundler module
- **Tests**: `packages/cli/src/__tests__/bundler/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and bundler module structure

- [X] T001 Create bundler directory structure in packages/cli/src/bundler/
- [X] T002 [P] Create types.ts with BundleOptions, BundleResult, BundleError classes in packages/cli/src/bundler/types.ts
- [X] T003 Create MIME_TYPES constants and helper functions (getMimeType, canInline, getFileType) in packages/cli/src/bundler/types.ts (depends on T002)
- [X] T004 [P] Create test fixtures directory with sample presentation in packages/cli/src/__tests__/bundler/__fixtures__/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure modules that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] Create image-inliner.spec.ts unit tests in packages/cli/src/__tests__/bundler/image-inliner.spec.ts
- [X] T006 [P] Create html-generator.spec.ts unit tests in packages/cli/src/__tests__/bundler/html-generator.spec.ts (include tests for FR-017: minimal HTML wrapper when no layout, FR-018: layout template HTML content inclusion)
- [X] T007 Implement image-inliner.ts (inlineImage, shouldInline functions) in packages/cli/src/bundler/image-inliner.ts
- [X] T008 Implement html-generator.ts (generateHTML, generateContainerElement functions) in packages/cli/src/bundler/html-generator.ts
- [X] T009 Run pnpm run check and fix any Biome issues

**Checkpoint**: Foundation ready - image inliner and HTML generator available for all stories

---

## Phase 3: User Story 1 - Basic Bundle Creation (Priority: P1) 🎯 MVP

**Goal**: Create a minimal standalone bundle with index.html, bundle.js, and embedded config

**Independent Test**: Run `eligian presentation.eligian --bundle` on a minimal .eligian file and verify output folder contains working index.html that opens in browser

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T010 [P] [US1] Create runtime-bundler.spec.ts tests for bundleRuntime function in packages/cli/src/__tests__/bundler/runtime-bundler.spec.ts
- [X] T011 [P] [US1] Create bundler-index.spec.ts integration test for createBundle (minimal case) in packages/cli/src/__tests__/bundler/bundler-index.spec.ts

### Implementation for User Story 1

- [X] T012 [US1] Implement runtime-bundler.ts (bundleRuntime, extractUsedOperations, generateEntryPoint) in packages/cli/src/bundler/runtime-bundler.ts
- [X] T013 [US1] Create runtime-wrapper.js template for Eligius initialization in packages/cli/templates/runtime-wrapper.js (SKIPPED - entry point generated inline via generateEntryPoint)
- [X] T014 [US1] Implement bundler index.ts with createBundle orchestration (minimal path) in packages/cli/src/bundler/index.ts
- [X] T015 [US1] Add --bundle flag to CLI in packages/cli/src/main.ts
- [X] T016 [US1] Export bundler API from library index in packages/cli/src/index.ts
- [X] T017 [US1] Run pnpm run check and fix any Biome issues
- [X] T018 [US1] Verify tests pass using vitest-mcp tools (58 pass, 28 skipped integration tests)

**Checkpoint**: ✅ User Story 1 complete - Basic bundles can be created from minimal .eligian files

---

## Phase 4: User Story 2 - Asset Collection and Organization (Priority: P2)

**Goal**: Collect all CSS files and assets, rewrite URLs, copy non-inlined assets to output

**Independent Test**: Create a presentation with CSS files referencing images and fonts, bundle it, and verify all assets are in assets/ folder with correct references

### Tests for User Story 2

- [X] T019 [P] [US2] Create css-processor.spec.ts tests for processCSS, rewriteCSSUrls in packages/cli/src/__tests__/bundler/css-processor.spec.ts (include test for FR-010: external URLs http/https preserved unchanged)
- [X] T020 [P] [US2] Create asset-collector.spec.ts tests for collectAssets function in packages/cli/src/__tests__/bundler/asset-collector.spec.ts (include test for FR-011: video/audio files copied to assets folder, never inlined)

### Implementation for User Story 2

- [X] T021 [US2] Implement css-processor.ts (processCSS, rewriteCSSUrls functions) in packages/cli/src/bundler/css-processor.ts
- [X] T022 [US2] Implement asset-collector.ts (collectAssets, extractCSSUrls, resolveAssetPath) in packages/cli/src/bundler/asset-collector.ts
- [X] T023 [US2] Update bundler index.ts to integrate asset collection and CSS processing in packages/cli/src/bundler/index.ts
- [X] T024 [US2] Add test fixtures with CSS and image assets in packages/cli/src/__tests__/bundler/__fixtures__/sample-presentation/
- [X] T025 [US2] Run pnpm run check and fix any Biome issues
- [X] T026 [US2] Verify tests pass using vitest-mcp tools (95 pass, 19 skipped integration tests)

**Checkpoint**: ✅ User Stories 1 AND 2 complete - Bundles include all assets with correct references

---

## Phase 5: User Story 3 - Image Inlining for Small Assets (Priority: P3)

**Goal**: Inline images smaller than threshold as base64 data URIs in CSS

**Independent Test**: Create presentation with images of various sizes, verify small ones are inlined as data URIs while large ones are copied to assets/

### Tests for User Story 3

- [X] T027 [P] [US3] Add inlining threshold tests to css-processor.spec.ts in packages/cli/src/__tests__/bundler/css-processor.spec.ts
- [X] T028 [P] [US3] Add inlining decision tests to image-inliner.spec.ts in packages/cli/src/__tests__/bundler/image-inliner.spec.ts

### Implementation for User Story 3

- [X] T029 [US3] Update css-processor.ts to inline small images based on threshold in packages/cli/src/bundler/css-processor.ts (ALREADY DONE in Phase 4 - uses manifest.inline/dataUri)
- [X] T030 [US3] Update asset-collector.ts to mark assets for inlining in packages/cli/src/bundler/asset-collector.ts (ALREADY DONE in Phase 4 - has shouldInlineAsset)
- [X] T031 [US3] Add test fixtures with small and large images in packages/cli/src/__tests__/bundler/__fixtures__/ (ALREADY EXISTS - hero.png 60KB, icon-star.png 69B)
- [X] T032 [US3] Run pnpm run check and fix any Biome issues
- [X] T033 [US3] Verify tests pass using vitest-mcp tools (116 pass, 19 skipped integration tests)

**Checkpoint**: ✅ User Stories 1, 2, AND 3 complete - Small images are inlined, large ones are copied

---

## Phase 6: User Story 4 - Bundle Output Customization (Priority: P4)

**Goal**: Support custom output directory, minification, configurable inline threshold

**Independent Test**: Run bundle command with various options (-o, --minify, --inline-threshold) and verify output matches configuration

### Tests for User Story 4

- [X] T034 [P] [US4] Add CLI options tests to cli.spec.ts for bundle flags in packages/cli/src/__tests__/cli.spec.ts
- [X] T035 [P] [US4] Add minification tests to runtime-bundler.spec.ts in packages/cli/src/__tests__/bundler/runtime-bundler.spec.ts

### Implementation for User Story 4

- [X] T036 [US4] Add -o, --output option for custom output directory in packages/cli/src/main.ts
- [X] T037 [US4] Add --minify flag for JS/CSS minification in packages/cli/src/main.ts
- [X] T038 [US4] Add --inline-threshold option for configurable image inlining in packages/cli/src/main.ts
- [X] T039 [US4] Add --force flag for overwriting existing output in packages/cli/src/main.ts
- [X] T040 [US4] Add --sourcemap flag for debug source maps in packages/cli/src/main.ts
- [X] T041 [US4] Update runtime-bundler.ts to support minification option in packages/cli/src/bundler/runtime-bundler.ts
- [X] T042 [US4] Run pnpm run check and fix any Biome issues
- [X] T043 [US4] Verify tests pass using vitest-mcp tools (135 bundler tests pass, 20 CLI tests pass)

**Checkpoint**: ✅ All user stories complete - Full bundle customization available

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T044 [P] Add error handling tests for edge cases in packages/cli/src/__tests__/bundler/: missing assets, output exists, circular asset references (spec edge case), unsupported image formats fallback to copy (spec edge case)
- [X] T045 [P] Update quickstart.md with actual CLI examples verified against implementation in specs/040-standalone-bundle/quickstart.md (already comprehensive)
- [X] T046 Add bundle statistics logging (file count, total size, time) in packages/cli/src/main.ts (already implemented at lines 202-207)
- [X] T047 Run full test suite with vitest-mcp and verify all tests pass (2145 passed total, 43 skipped)
- [X] T048 Run pnpm run build to verify TypeScript compilation (build succeeded)
- [ ] T049 Manual browser testing: open generated bundle in Chrome, Firefox, Edge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can proceed sequentially in priority order (P1 → P2 → P3 → P4)
  - Each story builds on previous stories' infrastructure
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Requires Foundational phase. Creates core bundler infrastructure.
- **User Story 2 (P2)**: Builds on US1's bundler index. Adds asset collection.
- **User Story 3 (P3)**: Builds on US2's CSS processor. Adds inlining logic.
- **User Story 4 (P4)**: Builds on US1-3. Adds CLI options and customization.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types and interfaces before implementation
- Core modules before integration
- Unit tests before integration tests
- Story complete before moving to next priority

### Parallel Opportunities

**Setup Phase**:
- T002, T003, T004 can run in parallel (different files)

**Foundational Phase**:
- T005, T006 can run in parallel (different test files)
- T007, T008 can run in parallel (different modules)

**User Story 1**:
- T010, T011 can run in parallel (different test files)

**User Story 2**:
- T019, T020 can run in parallel (different test files)

**User Story 3**:
- T027, T028 can run in parallel (different test files)

**User Story 4**:
- T034, T035 can run in parallel (different test files)

**Polish Phase**:
- T044, T045 can run in parallel (different concerns)

---

## Parallel Example: User Story 1

```bash
# Launch tests for User Story 1 together:
Task: "Create runtime-bundler.spec.ts tests in packages/cli/src/__tests__/bundler/runtime-bundler.spec.ts"
Task: "Create bundler-index.spec.ts integration test in packages/cli/src/__tests__/bundler/bundler-index.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test basic bundle creation independently
5. Deploy/demo if ready - basic bundles work!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP: Basic bundles work!**
3. Add User Story 2 → Test independently → **Assets collected correctly**
4. Add User Story 3 → Test independently → **Image inlining works**
5. Add User Story 4 → Test independently → **Full customization available**
6. Each story adds value without breaking previous stories

### Key Files by Module

| Module | Files |
|--------|-------|
| Types | `packages/cli/src/bundler/types.ts` |
| Image Inliner | `packages/cli/src/bundler/image-inliner.ts` |
| HTML Generator | `packages/cli/src/bundler/html-generator.ts` |
| CSS Processor | `packages/cli/src/bundler/css-processor.ts` |
| Asset Collector | `packages/cli/src/bundler/asset-collector.ts` |
| Runtime Bundler | `packages/cli/src/bundler/runtime-bundler.ts` |
| Bundler Index | `packages/cli/src/bundler/index.ts` |
| CLI Integration | `packages/cli/src/main.ts` |
| Library Exports | `packages/cli/src/index.ts` |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Run `pnpm run check` after each task completion (Constitution Principle XI)
- Use vitest-mcp tools for test execution (Constitution Principle XXIII)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
