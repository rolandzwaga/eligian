# Tasks: Label Editor for VSCode Extension

**Input**: Design documents from `/specs/036-create-a-specialized/`
**Prerequisites**: plan.md, spec.md (user stories with priorities)

**Tests**: Following constitution principle II (Comprehensive Testing), all tasks include test-first development.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Extension code: `packages/extension/src/extension/`
- Webview code: `packages/extension/media/`
- Language code: `packages/language/src/`
- Test helpers: `specs/TESTING_GUIDE.md` (consult before writing tests)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure needed by all user stories

- [X] T001 Create label editor directory structure `packages/extension/src/extension/label-editor/`
- [X] T002 [P] Create label editor templates directory `packages/extension/src/extension/label-editor/templates/`
- [X] T003 [P] Create webview script file `packages/extension/media/label-editor.ts` (empty stub)
- [X] T004 Update esbuild configuration `packages/extension/esbuild.mjs` to add third bundle for label-editor.ts
  - Add labelEditorCtx similar to existing preview bundle
  - Entry point: `media/label-editor.ts`
  - Output: `out/media/label-editor.js`
  - Platform: browser, format: iife
- [X] T005 [P] Update package.json contributions to register custom editor
  - Add `customEditors` contribution with viewType: `eligian.labelEditor`
  - Selector: `filenamePattern: "**/labels*.json"`
  - Priority: `option` (allows choosing between editors)
- [X] T006 [P] Create label editor test fixtures in `packages/language/src/__tests__/label-editor-integration/fixtures/`
  - Valid label file (2 groups, 3 translations each)
  - Empty label file (empty array)
  - Invalid label file (missing required fields)
- [X] T007 Commit Phase 1 work to git

**Checkpoint**: Basic project structure ready for implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Validation Infrastructure

- [ ] T008 [P] Create `LabelValidation.ts` in `packages/extension/src/extension/label-editor/LabelValidation.ts`
  - Pure validation functions for group ID, language code, label text, UUID
  - Export validation error types
  - No VSCode dependencies (pure TypeScript)
- [ ] T009 [P] Write unit tests for LabelValidation in `packages/extension/src/extension/label-editor/__tests__/LabelValidation.spec.ts`
  - Test validateGroupId (duplicate detection, empty string, invalid characters)
  - Test validateLanguageCode (xx-XX pattern matching)
  - Test validateLabelText (non-empty requirement)
  - Test validateUUID (UUID v4 format)
  - Test generateUUID (returns valid UUID)

### Message Protocol Types

- [ ] T010 [P] Create message type definitions in `packages/extension/src/extension/label-editor/types.ts`
  - ToWebviewMessage union type (initialize, reload, validation-error, save-complete)
  - ToExtensionMessage union type (ready, update, request-save, validate, check-usage)
  - LabelGroup interface (id, labels array)
  - Translation interface (id, languageCode, label)
  - ValidationError interface (groupId, translationId, field, message, code)

### HTML Template

- [ ] T011 Create HTML template in `packages/extension/src/extension/label-editor/templates/label-editor.html`
  - Split-view layout (left panel + right panel)
  - CSP directives for inline scripts
  - VSCode CSS variable usage for theming
  - Message passing script inclusion
  - Reference existing `preview.html` for CSP and structure patterns

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

- [ ] T012 Commit Phase 2 work to git

---

## Phase 3: User Story 1 - Navigate to Label Editor from Import Statement (Priority: P1) 🎯 MVP

**Goal**: Enable Ctrl+Click or F12 navigation from `.eligian` label imports to custom editor

**Independent Test**: Open `.eligian` file with `labels "./my-labels.json"`, Ctrl+Click path, verify custom editor opens

### Tests for User Story 1

**NOTE: Write these tests FIRST, ensure they FAIL before implementation** (Constitution Principle II)

- [ ] T013 [P] [US1] Create `navigation.spec.ts` in `packages/language/src/__tests__/label-editor-integration/navigation.spec.ts`
  - Consult `specs/TESTING_GUIDE.md` for test helpers (createTestContext, setupCSSRegistry)
  - Use `beforeAll()` for createTestContext() (expensive setup once)
  - Test: DefinitionProvider returns location for label import path
  - Test: DefinitionProvider returns undefined for non-import positions
  - Test: Path resolution works for relative paths (./labels.json, ../labels.json)

### Implementation for User Story 1

- [ ] T014 [P] [US1] Create `LabelEditorProvider.ts` stub in `packages/extension/src/extension/label-editor/LabelEditorProvider.ts`
  - Implement CustomTextEditorProvider interface
  - resolveCustomTextEditor method (receives document, webviewPanel, token)
  - Basic webview setup (HTML loading, message handling stub)
  - No actual functionality yet - just structure
  - NOTE: CustomTextEditorProvider uses TextDocument directly - no custom document wrapper needed

- [ ] T015 [P] [US1] Create `EligianDefinitionProvider.ts` in `packages/language/src/eligian-definition-provider.ts`
  - Implement DefinitionProvider interface
  - provideDefinition method: detect label import path at cursor position
  - Use regex to extract import path from line text: `labels\s+"([^"]+)"`
  - Resolve relative path to absolute URI
  - Return Location with file URI and position(0, 0)

- [ ] T016 [US1] Register custom editor provider in `packages/extension/src/extension/main.ts`
  - Import LabelEditorProvider
  - Create provider instance
  - Register with `vscode.window.registerCustomEditorProvider`
  - Add to context.subscriptions for cleanup

- [ ] T017 [US1] Register definition provider in `packages/extension/src/extension/main.ts`
  - Import EligianDefinitionProvider
  - Create provider instance
  - Register with `vscode.languages.registerDefinitionProvider`
  - Selector: language ID 'eligian'
  - Add to context.subscriptions

- [ ] T018 [US1] Implement "Edit Labels" context menu command
  - Register command `eligian.openLabelEditor` in main.ts
  - Command handler: get active editor, check if cursor on label import, open custom editor
  - Add to package.json contributions → commands
  - Add to package.json contributions → menus → editor/context (when: resourceLangId == eligian)

- [ ] T019 [US1] Run navigation tests and verify they PASS
  - `pnpm test navigation.spec.ts`
  - All 3 tests should pass (definition provider, path resolution, non-import positions)
  - Measure navigation time from Ctrl+Click to editor open - verify < 2 seconds (SC-001)

**Checkpoint**: User can now navigate from .eligian imports to label editor (editor is empty but opens)

- [ ] T020 Commit Phase 3 (US1) work to git

---

## Phase 4: User Story 2 - Edit Label Groups and Translations Visually (Priority: P1)

**Goal**: Provide GUI for CRUD operations on label groups and translations

**Independent Test**: Open label file in editor, add/edit/delete groups and translations, save, verify JSON matches edits

### Tests for User Story 2

- [ ] T021 [P] [US2] Create `crud-operations.spec.ts` in `packages/extension/src/extension/label-editor/__tests__/crud-operations.spec.ts`
  - Test: Add new label group creates empty group with editable ID
  - Test: Add translation to group creates translation with language dropdown + text input
  - Test: Edit group ID updates JSON on save
  - Test: Edit translation text updates JSON on save
  - Test: Delete group removes from JSON
  - Test: Drag-reorder groups changes JSON array order
  - Test: Empty state message shows in right panel when no group selected (FR-033)

### Implementation for User Story 2

#### Webview UI Implementation

- [ ] T022 [P] [US2] Implement webview UI in `packages/extension/media/label-editor.ts`
  - Define state interface (labels array, selectedGroupIndex, validationErrors, isDirty)
  - Implement message handler for 'initialize' message from extension
  - Implement renderGroups() function to populate left panel
  - Implement renderTranslations() function to populate right panel
  - Wire up DOM event listeners (click, input, drag events)

- [ ] T023 [P] [US2] Implement left panel (groups) functionality in `media/label-editor.ts`
  - "+ Add Label Group" button click handler
  - Group selection click handler (highlights group, shows translations)
  - Inline group ID editing (contenteditable or input field)
  - Delete group button - sends 'check-usage' message to extension before deletion (FR-009)
  - HTML5 drag-and-drop for reordering (dragstart, dragover, drop events)

- [ ] T024 [P] [US2] Implement right panel (translations) functionality in `media/label-editor.ts`
  - "+ Add Translation" button click handler
  - Language code dropdown - populate with common suggestions: en-US, nl-NL, fr-FR, de-DE, es-ES, ja-JP, zh-CN (FR-032)
  - Label text input field with change handlers
  - Delete translation button (removes from group's labels array)
  - Empty state message when no group selected (FR-033): "Select a label group to view translations"

#### Extension-side Implementation

- [ ] T025 [US2] Implement message handling in `LabelEditorProvider.ts`
  - Handle 'ready' message from webview → send 'initialize' with parsed JSON
  - Handle 'update' message → update TextDocument content (JSON.stringify)
  - Handle 'request-save' message → trigger VSCode save
  - Handle 'validate' message → run validation, send errors back
  - Message handlers should be pure functions

- [ ] T026 [US2] Implement document update logic in `LabelEditorProvider.ts`
  - Parse TextDocument content as JSON on editor open
  - Send parsed labels array to webview via 'initialize' message
  - On 'update' message: create WorkspaceEdit to replace document content
  - Apply edit using vscode.workspace.applyEdit
  - VSCode's undo/redo stack handles this automatically (no custom logic needed)

- [ ] T027 [US2] Implement save logic in `LabelEditorProvider.ts`
  - On 'request-save' message: validate labels array
  - If valid: update document and trigger save
  - If invalid: send 'validation-error' message to webview
  - Let VSCode's save mechanism handle actual file write

#### Styling and Theming

- [ ] T028 [P] [US2] Add CSS styles to `label-editor.html`
  - Use VSCode CSS variables: `--vscode-button-background`, `--vscode-input-background`, etc.
  - Split-view layout: flex container with 30% left / 70% right panels
  - Group list styling: hover states, selected state (highlighted)
  - Translation cards: border, padding, delete button positioning
  - Button styling: consistent with VSCode buttons
  - Drag-and-drop visual feedback (dragging opacity, drop target highlight)

- [ ] T029 [P] [US2] Implement delete confirmation dialog in `media/label-editor.ts`
  - Handle response to 'check-usage' message from extension (receives array of file URIs)
  - Display confirmation dialog showing: "Label 'X' is used in N files: [list]. Delete anyway?"
  - If usage array empty: show simple confirmation "Delete label 'X'?"
  - On user confirmation: send 'update' message with group removed from labels array
  - On user cancel: close dialog, keep group intact

- [ ] T030 [US2] Run CRUD tests and verify they PASS
  - `pnpm test crud-operations.spec.ts`
  - All 7 tests should pass (add group, add translation, edit, delete, reorder, empty state, delete confirmation)

**Checkpoint**: Users can now create, edit, delete, and reorder labels visually

- [ ] T031 Commit Phase 4 (US2) work to git

---

## Phase 5: User Story 3 - Automatic UUID Management (Priority: P2)

**Goal**: Hide UUIDs from users, auto-generate and maintain them transparently

**Independent Test**: Add translation in UI, inspect JSON to verify UUID present and valid, confirm UI never shows UUIDs

### Tests for User Story 3

- [ ] T032 [P] [US3] Create `uuid-management.spec.ts` in `packages/extension/src/extension/label-editor/__tests__/uuid-management.spec.ts`
  - Test: New translation gets valid UUID v4 in JSON
  - Test: Label file with missing UUIDs auto-fixes on load
  - Test: Editing translation preserves existing UUID
  - Test: UI never displays UUID values (check HTML content, not data attributes)

### Implementation for User Story 3

- [ ] T033 [P] [US3] Implement UUID generation in `media/label-editor.ts`
  - Import crypto.randomUUID() (Web Crypto API, available in webview)
  - On "+ Add Translation" click: generate UUID for new translation
  - Assign to translation.id field before adding to group
  - Ensure UUID never rendered to DOM (only stored in state)

- [ ] T034 [US3] Implement UUID auto-fix in `LabelEditorProvider.ts`
  - On document open: parse JSON labels array
  - For each translation: check if ID is missing or invalid UUID
  - If invalid: generate new UUID v4 using crypto.randomUUID()
  - Send corrected labels array to webview via 'initialize' message
  - Mark document as dirty if UUIDs were fixed (user can save to persist)

- [ ] T035 [US3] Ensure UUIDs never appear in UI in `media/label-editor.ts`
  - Verify renderTranslations() never includes translation.id in visible HTML
  - UUIDs can be in data attributes (e.g., data-translation-id) for internal tracking
  - But never in textContent, innerHTML, or input values
  - Add comment documenting this requirement

- [ ] T036 [US3] Run UUID management tests and verify they PASS
  - `pnpm test uuid-management.spec.ts`
  - All 4 tests should pass (generation, auto-fix, preservation, invisibility)

**Checkpoint**: UUIDs are transparent to users - managed automatically

- [ ] T037 Commit Phase 5 (US3) work to git

---

## Phase 6: User Story 4 - Validation and Error Prevention (Priority: P2)

**Goal**: Real-time validation with inline error messages, prevent saving invalid data

**Independent Test**: Enter invalid data (duplicate IDs, bad language codes, empty fields), verify errors appear and save is blocked

### Tests for User Story 4

- [ ] T038 [P] [US4] Create `validation.spec.ts` in `packages/language/src/__tests__/label-editor-integration/validation.spec.ts`
  - Test: Duplicate group ID shows error and blocks save
  - Test: Invalid language code (not xx-XX pattern) shows error on blur
  - Test: Empty label text shows error and blocks save
  - Test: Group with zero translations shows error and blocks save
  - Test: All validation passes allows save to succeed

### Implementation for User Story 4

- [ ] T039 [US4] Implement real-time group ID validation in `media/label-editor.ts`
  - On group ID input blur: check for duplicates in labels array
  - Check for empty string
  - Check for invalid characters (use regex: /^[a-zA-Z0-9._-]+$/)
  - Display inline error message below input field
  - Add to validationErrors map in state

- [ ] T040 [US4] Implement language code validation in `media/label-editor.ts`
  - On language code dropdown change: validate xx-XX pattern
  - Regex: /^[a-z]{2,3}-[A-Z]{2,3}$/
  - Display inline error if invalid
  - Suggest correct format: "Use format: en-US, nl-NL, etc."
  - Add to validationErrors map

- [ ] T041 [US4] Implement label text validation in `media/label-editor.ts`
  - On label text input blur: check for empty string
  - Display inline error if empty: "Label text cannot be empty"
  - Add to validationErrors map

- [ ] T042 [US4] Implement group-level validation in `media/label-editor.ts`
  - Check each group has at least one translation
  - Display error at group level if empty
  - Add to validationErrors map

- [ ] T043 [US4] Implement save blocking logic in `media/label-editor.ts`
  - Before sending 'request-save' message: check validationErrors map
  - If any errors exist: show summary dialog, prevent save
  - If no errors: proceed with save message to extension
  - Visual indicator: disable save button when errors present (if manual save button exists)

- [ ] T044 [US4] Integrate validation with extension in `LabelEditorProvider.ts`
  - On 'validate' message from webview: run LabelValidation functions
  - Return validation errors as 'validation-error' message
  - On 'request-save': validate before updating document
  - If invalid: send 'validation-error' message, do NOT save

- [ ] T045 [US4] Run validation tests and verify they PASS
  - `pnpm test validation.spec.ts`
  - All 5 tests should pass (duplicate ID, language code, empty text, zero translations, successful save)

**Checkpoint**: Editor prevents invalid data, guides users to correct structure

- [ ] T046 Commit Phase 6 (US4) work to git

---

## Phase 7: User Story 5 - Theme Support and Accessibility (Priority: P3)

**Goal**: Respect VSCode themes (light/dark/high-contrast) and provide keyboard navigation

**Independent Test**: Switch VSCode themes and verify editor updates, navigate using only keyboard

### Tests for User Story 5

- [ ] T047 [P] [US5] Create `accessibility.spec.ts` in `packages/extension/src/extension/label-editor/__tests__/accessibility.spec.ts`
  - Test: Theme change message triggers CSS variable update (mock test)
  - Test: All interactive elements have tabindex
  - Test: Keyboard shortcuts work (Tab, Enter, Escape, Arrow keys)
  - Test: ARIA labels present on buttons and inputs
  - Test: Focus indicators visible (verify CSS includes :focus styles)

### Implementation for User Story 5

- [ ] T048 [P] [US5] Implement theme support in `media/label-editor.ts`
  - Listen for VSCode theme change events (if available via message)
  - Or rely on CSS variables which update automatically
  - Verify all colors use CSS variables: `var(--vscode-editor-background)`, etc.
  - Test in all 3 themes: light, dark, high-contrast

- [ ] T049 [P] [US5] Implement keyboard navigation in `media/label-editor.ts`
  - Add tabindex to all interactive elements (groups, translations, buttons)
  - Tab order: groups list → translations list → buttons
  - Enter key: select group, edit field, confirm action
  - Escape key: cancel edit, close dialog
  - Arrow keys: navigate groups list, navigate translations list

- [ ] T050 [P] [US5] Add ARIA labels and roles in `label-editor.html`
  - role="list" on groups container
  - role="listitem" on each group
  - role="button" on all buttons
  - aria-label on icon buttons (delete, add)
  - aria-labelledby for inputs (associate with visible labels)
  - aria-live for validation error messages (polite)

- [ ] T051 [US5] Implement focus management in `media/label-editor.ts`
  - When group selected: focus first translation input
  - When adding group: focus new group ID input
  - When adding translation: focus language code dropdown
  - When deleting: move focus to next item or previous if last

- [ ] T052 [P] [US5] Add CSS focus indicators to `label-editor.html`
  - :focus styles for all interactive elements
  - Visible outline or border change
  - High contrast mode support (ensure focus indicators visible)
  - Color contrast ratio >= 4.5:1 (WCAG AA requirement)

- [ ] T053 [US5] Run accessibility tests and verify they PASS
  - `pnpm test accessibility.spec.ts`
  - All 5 tests should pass (theme support, tabindex, keyboard shortcuts, ARIA labels, focus indicators)
  - Measure theme change response time - verify < 500ms from VSCode theme change to editor update (Assumption 10)

**Checkpoint**: Editor is accessible and theme-aware

- [ ] T054 Commit Phase 7 (US5) work to git

---

## Phase 8: User Story 6 - File Compatibility and Editor Choice (Priority: P3)

**Goal**: Validate schema, allow switching between custom editor and text editor, handle external changes

**Independent Test**: Open various JSON files (valid labels, invalid labels, non-labels), verify correct behavior

### Tests for User Story 6

- [ ] T055 [P] [US6] Create `file-compatibility.spec.ts` in `packages/language/src/__tests__/label-editor-integration/file-compatibility.spec.ts`
  - Test: Valid label file opens in custom editor (if priority=option is set)
  - Test: Invalid JSON file shows error, offers text editor
  - Test: Non-label JSON (e.g., package.json) does NOT trigger custom editor
  - Test: "Open With..." menu shows both editor options
  - Test: External file change shows warning in editor

### Implementation for User Story 6

- [ ] T056 [US6] Implement schema validation in `LabelEditorProvider.ts`
  - On resolveCustomTextEditor: parse JSON and validate structure
  - Check: is it an array?
  - Check: do elements have 'id' and 'labels' fields?
  - Check: do labels have required fields (id, languageCode, label)?
  - If invalid: show error message, offer "Open in Text Editor" button

- [ ] T057 [US6] Implement "Open in Text Editor" fallback in `LabelEditorProvider.ts`
  - On schema validation failure: show vscode.window.showErrorMessage with actions
  - Action button: "Open in Text Editor"
  - On click: execute vscode.commands.executeCommand('vscode.openWith', uri, 'vscode.vscode-json-language-features')
  - Use explicit JSON editor ID for guaranteed JSON syntax highlighting
  - Close custom editor if user chooses text editor

- [ ] T058 [P] [US6] Implement file watcher for external changes
  - Create `LabelFileWatcher.ts` in `packages/extension/src/extension/label-editor/`
  - Use vscode.workspace.createFileSystemWatcher pattern (see css-watcher.ts for reference)
  - On file change: send 'reload' message to webview
  - Debounce changes (300ms) to avoid spam
  - Dispose watcher when editor closes

- [ ] T059 [US6] Integrate file watcher with provider in `LabelEditorProvider.ts`
  - Create LabelFileWatcher instance in resolveCustomTextEditor
  - Pass document URI to watcher
  - On 'reload' event: re-parse JSON, send to webview
  - Show info message: "Label file was modified externally. Reloaded."
  - Add watcher to subscriptions for cleanup

- [ ] T060 [US6] Handle reload in webview in `media/label-editor.ts`
  - On 'reload' message: update labels state
  - Re-render groups and translations
  - Preserve selected group if it still exists
  - Show notification: "File reloaded due to external changes"

- [ ] T061 [US6] Verify package.json customEditor priority=option
  - Ensure priority is "option" not "default"
  - This allows user to choose between Label Editor and text editor
  - Test "Open With..." menu shows both options

- [ ] T062 [US6] Run file compatibility tests and verify they PASS
  - `pnpm test file-compatibility.spec.ts`
  - All 5 tests should pass (valid file, invalid file, non-label file, editor choice, external changes)

**Checkpoint**: Editor gracefully handles invalid files and external changes

- [ ] T063 Commit Phase 8 (US6) work to git

---

## Phase 9: Label Usage Tracking (Cross-Cutting)

**Goal**: Show which `.eligian` files use a label when deleting (from US2 acceptance scenario 4)

- [ ] T064 [P] Create `LabelUsageTracker.ts` in `packages/extension/src/extension/label-editor/LabelUsageTracker.ts`
  - Implement searchWorkspace(groupId: string): Promise<vscode.Uri[]>
  - Use vscode.workspace.findFiles to get all .eligian files
  - Parse each file, search for label references (regex: `@{groupId}`)
  - Return array of URIs where label is used

- [ ] T065 Integrate usage tracker with delete confirmation in `LabelEditorProvider.ts`
  - On 'check-usage' message from webview: call LabelUsageTracker.searchWorkspace
  - Send results back to webview
  - Webview shows confirmation dialog with file list
  - Example: "Label 'welcome-title' is used in 3 files: file1.eligian, file2.eligian, file3.eligian. Delete anyway?"

- [ ] T066 [P] Write unit tests for LabelUsageTracker in `packages/extension/src/extension/label-editor/__tests__/LabelUsageTracker.spec.ts`
  - Test: Empty workspace returns empty array
  - Test: Label used in single file returns that file
  - Test: Label used in multiple files returns all files
  - Test: Label not used returns empty array

- [ ] T067 Commit Phase 9 (label usage tracking) work to git

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final polish, documentation, and quality checks

- [ ] T068 [P] Add comprehensive JSDoc comments to all public methods
  - LabelEditorProvider.ts
  - LabelValidation.ts
  - LabelUsageTracker.ts
  - EligianDefinitionProvider.ts

- [ ] T069 [P] Create user documentation in `specs/036-create-a-specialized/quickstart.md`
  - User Guide: How to navigate to editor, how to use UI
  - Developer Guide: Architecture overview, adding features

- [ ] T070 [P] Update `examples/demo.eligian` with label editor usage example (Constitution XXIV)
  - Add section showing label import
  - Add comments explaining how to use label editor
  - Verify demo compiles successfully

- [ ] T071 [P] Update `LANGUAGE_SPEC.md` if needed (Constitution XVII)
  - Document label import syntax (if not already documented)
  - Verify spec is up to date

- [ ] T072 Update `specs/TECHNICAL_OVERVIEW.md` (Constitution XXVI)
  - Add Label Editor section under VS Code Extension
  - Document esbuild bundle configuration for label-editor webview
  - Document message protocol (Extension ↔ Webview)
  - Document custom editor registration pattern

- [ ] T073 Run full test suite and verify 80%+ coverage (Constitution II)
  - `pnpm run test:coverage`
  - Analyze coverage report
  - If below 80% for business logic: add missing tests or request user approval for exception

- [ ] T074 Run Biome check and fix all issues (Constitution XI)
  - `pnpm run check`
  - Fix all linting and formatting errors
  - Update biome.json if legitimate false positives

- [ ] T075 Run TypeScript type check (Constitution XI)
  - `pnpm run typecheck`
  - Fix all type errors
  - Ensure no `any` types without justification

- [ ] T076 Perform manual testing of all user stories
  - US1: Navigation from import to editor
  - US2: CRUD operations (add, edit, delete, reorder)
  - US3: UUID invisibility and auto-generation
  - US4: Validation error messages and save blocking
  - US5: Theme switching and keyboard navigation
  - US6: File compatibility and external changes

- [ ] T077 Final commit for Phase 10 (polish)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2)
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2), integration with US1
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2), US2 implementation (needs webview UI)
- **User Story 4 (Phase 6)**: Depends on Foundational (Phase 2), US2 implementation (needs webview UI)
- **User Story 5 (Phase 7)**: Depends on US2 (needs UI to make accessible)
- **User Story 6 (Phase 8)**: Depends on Foundational, can integrate with US1
- **Label Usage Tracking (Phase 9)**: Depends on US2 (delete functionality)
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - can start after Foundational
- **User Story 2 (P1)**: Independent - can start after Foundational
- **User Story 3 (P2)**: Depends on US2 (needs CRUD UI)
- **User Story 4 (P2)**: Depends on US2 (needs CRUD UI)
- **User Story 5 (P3)**: Depends on US2 (needs UI elements)
- **User Story 6 (P3)**: Independent - can start after Foundational

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution Principle II)
- Tests before models/services/UI
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: All setup tasks marked [P] can run in parallel
- **Phase 2**: T008-T009 (validation), T010 (types), T011 (HTML) can run in parallel
- **Phase 3 (US1)**: T013 (tests), T014 (provider stub), T015 (definition provider) can start in parallel
- **Phase 4 (US2)**: T022-T024 (webview UI components) can run in parallel after T021 tests written
- **Phase 5 (US3)**: T033-T035 can run in parallel after T032 tests written
- **Phase 6 (US4)**: T039-T042 (validation functions) can run in parallel after T038 tests written
- **Phase 7 (US5)**: T048-T052 (theme, keyboard, ARIA) can run in parallel after T047 tests written
- **Phase 8 (US6)**: T058 (watcher), T061 (package.json verification) can run in parallel
- **Phase 10**: T068-T072 (documentation) can run in parallel

---

## Parallel Example: User Story 2 (CRUD Operations)

```bash
# After T021 tests are written and failing:

# Launch webview UI tasks in parallel:
Task T022: "Implement webview UI state and message handling"
Task T023: "Implement left panel (groups) functionality"
Task T024: "Implement right panel (translations) functionality"
Task T028: "Add CSS styles for split-view layout"
Task T029: "Implement delete confirmation dialog"

# Then sequentially:
Task T025: "Implement extension message handling"
Task T026: "Implement document update logic"
Task T027: "Implement save logic"
Task T030: "Run CRUD tests and verify PASS"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Navigation)
4. Complete Phase 4: User Story 2 (CRUD Operations)
5. **STOP and VALIDATE**: Test US1 + US2 independently
6. Deploy/demo if ready

**MVP Deliverable**: Users can navigate to label editor and perform basic CRUD operations

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently (navigation works)
3. Add User Story 2 → Test independently (MVP complete: navigation + editing!)
4. Add User Story 3 → Test independently (UUIDs hidden)
5. Add User Story 4 → Test independently (validation working)
6. Add User Story 5 → Test independently (accessible)
7. Add User Story 6 → Test independently (robust)
8. Polish → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (navigation) + User Story 6 (file compatibility)
   - Developer B: User Story 2 (CRUD) → User Story 3 (UUIDs) → User Story 4 (validation)
   - Developer C: User Story 5 (accessibility) + Phase 9 (usage tracking) + Phase 10 (polish)
3. Stories integrate cleanly due to message protocol separation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (RED-GREEN-REFACTOR)
- Stop at any checkpoint to validate story independently
- Consult `specs/TESTING_GUIDE.md` before writing tests to avoid common mistakes
- Constitution Principle II: Tests before implementation (NON-NEGOTIABLE)
- Constitution Principle XXIII: Commit after each phase completes

---

## Phase Completion Protocol (Constitution XXIII)

**CRITICAL**: After completing the FINAL task of each phase, you MUST execute this protocol before proceeding to the next phase.

### After Each Phase Completes:

**STOP IMMEDIATELY** and execute these steps:

1. ✅ **Update tasks.md** - Mark all completed tasks with `[X]`:
   - Change `[ ]` to `[X]` for each completed task
   - Verify task completion status is accurate
2. ✅ **Verify all phase tasks complete** - Check that every task in the phase is done
3. ✅ **Run quality checks**:
   ```bash
   pnpm run check          # Biome format + lint
   pnpm test               # All tests must pass
   ```
4. ✅ **Create git commit** (including tasks.md):
   ```bash
   git add -A
   git commit -m "feat(036): Phase X - <description>

   <list of tasks completed>

   🤖 Generated with Claude Code
   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```
5. ✅ **Confirm commit created**: `git log -1 --oneline` to verify
6. ✅ **ONLY THEN proceed to next phase**

### TodoWrite Integration

Add "Commit Phase X" as the FINAL task of each phase:
- Status: `pending` until quality checks pass
- Status: `in_progress` while running checks and committing
- Status: `completed` after git commit succeeds

---

**Total Tasks**: 77
**Task Count by User Story**:
- Setup: 7 tasks
- Foundational: 5 tasks
- US1 (Navigation): 8 tasks
- US2 (CRUD): 11 tasks (includes delete confirmation dialog)
- US3 (UUIDs): 5 tasks
- US4 (Validation): 9 tasks
- US5 (Accessibility): 8 tasks
- US6 (File Compatibility): 9 tasks
- Label Usage Tracking: 4 tasks
- Polish: 11 tasks

**Parallel Opportunities**: 30+ tasks marked [P] across all phases
**Independent Test Criteria**: Defined for each user story
**Suggested MVP Scope**: User Stories 1 + 2 (navigation + CRUD operations)
