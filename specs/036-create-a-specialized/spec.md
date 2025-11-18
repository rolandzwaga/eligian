# Feature Specification: Label Editor for VSCode Extension

**Feature Branch**: `036-create-a-specialized`
**Created**: 2025-01-18
**Status**: Draft
**Input**: User description: "Create a specialized label editor feature for the VSCode extension."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate to Label Editor from Import Statement (Priority: P1)

Users can quickly navigate from a label import in their `.eligian` file to a visual editor for managing those labels, using familiar IDE navigation patterns.

**Why this priority**: This is the primary entry point to the feature. Without navigation, users cannot access the editor. This delivers immediate value by connecting the developer's workflow (writing `.eligian` code) to label management.

**Independent Test**: Can be fully tested by opening an `.eligian` file with a label import, pressing Ctrl+Click or F12 on the import path, and verifying the custom editor opens. Delivers value even if the editor itself has minimal functionality.

**Acceptance Scenarios**:

1. **Given** a `.eligian` file with a label import statement like `labels "./my-labels.json"`, **When** user Ctrl+Clicks on the file path, **Then** the custom label editor opens for that JSON file
2. **Given** cursor positioned on a label import path, **When** user presses F12 (Go to Definition), **Then** the custom label editor opens
3. **Given** cursor positioned on a label import path, **When** user right-clicks and selects "Edit Labels" from context menu, **Then** the custom label editor opens
4. **Given** cursor positioned elsewhere in the `.eligian` file (not on an import path), **When** user tries to use "Edit Labels" command, **Then** command is unavailable or shows appropriate message

---

### User Story 2 - Edit Label Groups and Translations Visually (Priority: P1)

Users can create, edit, and delete label groups and their translations through a graphical interface without needing to understand or manually edit JSON syntax.

**Why this priority**: This is the core value proposition of the feature - making label editing accessible to non-technical users and faster for technical users. This forms the MVP of the editor itself.

**Independent Test**: Can be fully tested by opening a label JSON file in the custom editor, performing CRUD operations on groups and translations, saving, and verifying the JSON file contains the expected changes. Delivers value by eliminating JSON syntax knowledge requirement.

**Acceptance Scenarios**:

1. **Given** an empty label file is open in the editor, **When** user clicks "+ Add Label Group", **Then** a new group appears with an editable ID field and empty translations panel
2. **Given** a label group is selected, **When** user clicks "+ Add Translation", **Then** a new translation card appears with language code dropdown and text input
3. **Given** a translation exists, **When** user edits the language code or text and saves, **Then** the JSON file is updated with the new values
4. **Given** a label group exists, **When** user clicks the delete button, **Then** the group is removed from the JSON (with confirmation if used in `.eligian` files)
5. **Given** multiple label groups exist, **When** user drags a group to reorder, **Then** the JSON array order changes accordingly
6. **Given** a group ID is edited to match an existing ID, **When** user tries to save, **Then** an error message prevents saving and highlights the duplicate

---

### User Story 3 - Automatic UUID Management (Priority: P2)

Users never see or manage translation UUIDs - the system generates and maintains them automatically, keeping the interface simple and preventing errors.

**Why this priority**: This enhances UX by hiding technical complexity, but the editor could function without it (users could edit UUIDs manually in a pinch). Separates MVP from polish.

**Independent Test**: Can be fully tested by creating/editing translations in the UI, inspecting the saved JSON to verify UUIDs are present and correctly formatted, and confirming UUIDs never appear in the UI. Delivers value by reducing cognitive load.

**Acceptance Scenarios**:

1. **Given** user adds a new translation, **When** the file is saved, **Then** the JSON contains a random UUID for that translation's `id` field
2. **Given** a label JSON file with missing or invalid translation UUIDs, **When** opened in the editor, **Then** UUIDs are auto-generated and file can be saved with valid UUIDs
3. **Given** user edits a translation in the UI, **When** inspecting the JSON file, **Then** the translation's UUID remains unchanged (only language code or text changes)
4. **Given** user is working in the label editor, **When** viewing any part of the interface, **Then** no UUIDs are visible anywhere in the UI

---

### User Story 4 - Validation and Error Prevention (Priority: P2)

The editor validates user input in real-time and prevents saving invalid data, guiding users toward correct label file structure.

**Why this priority**: Validation improves quality of life but isn't essential for MVP functionality. Users could still use the editor and fix validation errors manually in JSON if needed.

**Independent Test**: Can be fully tested by entering invalid data (duplicate IDs, malformed language codes, empty fields) and verifying appropriate error messages appear and save is blocked. Delivers value by preventing common mistakes.

**Acceptance Scenarios**:

1. **Given** user enters a group ID that already exists, **When** attempting to save, **Then** an inline error appears indicating duplicate ID and save is blocked
2. **Given** user enters a language code not matching the xx-XX pattern (e.g., "english"), **When** field loses focus, **Then** an error message appears suggesting correct format
3. **Given** user leaves a label text field empty, **When** attempting to save, **Then** validation error appears requiring non-empty label text
4. **Given** user deletes all translations from a group, **When** attempting to save, **Then** error appears requiring at least one translation per group
5. **Given** all validation passes, **When** user saves, **Then** file is successfully written with valid JSON structure

---

### User Story 5 - Theme Support and Accessibility (Priority: P3)

The editor respects VSCode's theme settings and provides keyboard navigation for accessibility compliance.

**Why this priority**: Important for professional quality and accessibility compliance, but the editor is functional without it. Can be added as polish after core features work.

**Independent Test**: Can be fully tested by switching VSCode themes and verifying editor updates, using keyboard-only navigation to perform all operations. Delivers value for users with visual needs or keyboard-first workflows.

**Acceptance Scenarios**:

1. **Given** VSCode is using a dark theme, **When** label editor opens, **Then** editor uses dark theme colors matching VSCode's palette
2. **Given** VSCode switches from light to dark theme while editor is open, **When** theme changes, **Then** editor updates to match new theme automatically
3. **Given** editor is open, **When** user navigates using only Tab/Shift+Tab/Enter/Arrow keys, **Then** all UI elements are reachable and operable
4. **Given** VSCode is in high-contrast mode, **When** editor opens, **Then** all text has sufficient contrast ratio for accessibility standards

---

### User Story 6 - File Compatibility and Editor Choice (Priority: P3)

Users can choose between the custom editor and standard JSON text editor, and the custom editor only activates for valid label files.

**Why this priority**: This is defensive functionality preventing the editor from incorrectly handling non-label JSON files. Important for robustness but not core to the feature's value.

**Independent Test**: Can be fully tested by opening various JSON files and verifying custom editor only auto-opens for valid label files, and "Open With..." menu allows switching editors. Delivers value by preventing confusion and allowing fallback.

**Acceptance Scenarios**:

1. **Given** a JSON file matching the label schema structure, **When** file is opened, **Then** user is given option to open in Label Editor (not forced)
2. **Given** a JSON file NOT matching label schema (e.g., package.json), **When** file is opened, **Then** standard JSON editor opens (custom editor not offered)
3. **Given** a label file is open in the custom editor, **When** user right-clicks and selects "Open With...", **Then** menu shows both "Label Editor" and "JSON Text Editor" options
4. **Given** an invalid label file is opened in custom editor, **When** validation detects structural errors, **Then** error message appears with option to "Open in Text Editor"
5. **Given** a label file is being edited externally while open in the editor, **When** external change is detected, **Then** editor shows warning about external modifications

---

### Edge Cases

- What happens when user deletes a label group that is referenced in multiple `.eligian` files? (Should show warning with list of files using this label)
- What happens when two users edit the same label file simultaneously? (File watcher should detect external changes and warn user)
- What happens when label JSON file is deleted while editor is open? (Should show error and offer to close or recreate file)
- What happens when user enters extremely long label text (1000+ characters)? (Should allow but may affect UI layout)
- What happens when label file contains 100+ label groups? (Should remain performant with scrolling)
- What happens when user enters a language code with lowercase country code (e.g., "en-us")? (Should either auto-correct or show validation error with suggestion)
- What happens when JSON file is manually edited to have malformed UUIDs? (Editor should auto-fix on file open)
- What happens when user undos changes using Ctrl+Z? (Should integrate with VSCode's undo stack)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Definition Provider that detects label import paths in `.eligian` files and allows Ctrl+Click or F12 navigation to open the label editor
- **FR-002**: System MUST provide a right-click context menu command "Edit Labels" available when cursor is positioned on a label import path
- **FR-003**: System MUST display label groups in a left panel showing only the user-editable group ID for each entry
- **FR-004**: System MUST display translations for the selected label group in a right panel, showing language code and text only (UUIDs hidden)
- **FR-005**: Users MUST be able to add new label groups via an "+ Add Label Group" button
- **FR-006**: Users MUST be able to add new translations to a selected group via an "+ Add Translation" button
- **FR-007**: Users MUST be able to edit label group IDs inline in the left panel
- **FR-008**: Users MUST be able to edit language codes and label text in the right panel
- **FR-009**: Users MUST be able to delete label groups with a delete button (with confirmation dialog)
- **FR-010**: Users MUST be able to delete individual translations with a delete button
- **FR-011**: Users MUST be able to reorder label groups via drag-and-drop in the left panel
- **FR-012**: System MUST automatically generate random UUID (v4) for each new translation's `id` field
- **FR-013**: System MUST hide translation UUID values from all UI elements (never displayed to user)
- **FR-014**: System MUST automatically regenerate missing or invalid UUIDs when opening a label file
- **FR-015**: System MUST validate group ID uniqueness in real-time and show error for duplicates
- **FR-016**: System MUST validate group IDs are non-empty strings matching pattern `/^[a-zA-Z0-9._-]+$/` (alphanumeric, hyphens, underscores, dots)
- **FR-017**: System MUST validate language codes match the pattern xx-XX (e.g., en-US, nl-NL)
- **FR-018**: System MUST validate label text fields are non-empty
- **FR-019**: System MUST validate each label group has at least one translation
- **FR-020**: System MUST prevent saving when validation errors exist and display inline error messages
- **FR-021**: System MUST only activate custom editor for JSON files matching the label schema structure
- **FR-022**: System MUST use `priority: "option"` for editor registration, allowing users to choose between editors
- **FR-023**: System MUST support "Open With..." menu to switch between Label Editor and JSON text editor
- **FR-024**: System MUST detect invalid label file structure on open and offer to open in text editor instead
- **FR-025**: System MUST use CustomTextEditorProvider to integrate with VSCode's undo/redo stack, dirty state tracking, and save mechanisms
- **FR-028**: System MUST provide keyboard navigation for all UI elements (Tab, Enter, Arrow keys)
- **FR-029**: System MUST support VSCode's light, dark, and high-contrast themes with automatic theme switching
- **FR-030**: System MUST use VSCode CSS variables (`var(--vscode-*)`) for consistent look and feel and automatic theme adaptation
- **FR-031**: System MUST detect external file modifications and warn user about conflicting changes
- **FR-032**: System MUST provide language code dropdown with common suggestions (en-US, nl-NL, fr-FR, de-DE, es-ES, ja-JP, zh-CN)
- **FR-033**: System MUST show empty state message in right panel when no label group is selected
- **FR-034**: System MUST save label file with valid JSON structure matching the existing labels schema

### Key Entities

- **Label Group**: Represents a collection of translations for a single label identifier. Has a user-defined `id` (string) that serves as the import reference in `.eligian` files. Contains one or more translations.
- **Translation**: Represents a single language variant of a label. Has an auto-generated UUID `id` (hidden from user), a language code (string, format xx-XX), and label text (string). Belongs to exactly one label group.
- **Label File**: A JSON file containing an array of label groups. Must conform to the existing labels JSON schema. Serves as the data source for multilingual content in Eligius timelines.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can navigate from label import in `.eligian` file to label editor in under 2 seconds using Ctrl+Click or F12
- **SC-002**: Users can create a new label group with 3 translations in under 30 seconds without consulting documentation
- **SC-003**: 100% of saved label files pass validation against the existing labels JSON schema
- **SC-004**: Editor displays within 500ms when opening label files with up to 50 label groups
- **SC-005**: Editor remains responsive (< 100ms UI response) when managing label files with 100+ label groups
- **SC-006**: 0% of users see translation UUID values in any part of the UI (verified through user testing)
- **SC-007**: Editor correctly displays in all three VSCode themes (light, dark, high-contrast) with no visual glitches
- **SC-008**: All editor functions are accessible via keyboard-only navigation (100% keyboard accessibility)
- **SC-009**: Users can switch between custom editor and text editor view in under 3 clicks using "Open With..." menu
- **SC-010**: Validation errors appear within 500ms of invalid input and clearly indicate the problem and solution
- **SC-011**: File saves complete within 1 second for label files with up to 100 label groups
- **SC-012**: Undo/redo operations correctly revert changes with no data loss (tested across 10+ undo levels)
- **SC-013**: Editor meets WCAG 2.1 AA accessibility standards (minimum 4.5:1 color contrast ratio, ARIA labels on 100% of interactive elements, screen reader compatible)

## Assumptions

1. **Label file location**: Assumed label files are in the workspace and accessible via relative paths from `.eligian` files. Absolute paths and external URLs are out of scope.

2. **Concurrent editing**: Assumed the file watcher detection of external changes is sufficient for multi-user scenarios. Real-time collaborative editing is not required.

3. **Language code validation**: Assumed the xx-XX pattern validation is sufficient. Full ISO 639-1 and ISO 3166-1 validation against official language/country code lists is not required for MVP.

4. **Label usage tracking**: Assumed showing which `.eligian` files use a label (for delete confirmation) requires searching workspace files. This search should complete within 5 seconds for typical projects (< 1000 `.eligian` files).

5. **Browser compatibility**: Assumed VSCode's webview component provides sufficient browser compatibility. No additional polyfills or fallbacks needed.

6. **Label text length**: Assumed labels up to 5000 characters are reasonable. UI should handle this gracefully (scrolling, text wrapping).

7. **Group ID characters**: Assumed "valid identifier characters" means alphanumeric, hyphens, underscores, and dots (matching common programming identifier rules). No spaces, special characters, or Unicode outside ASCII.

8. **Drag-and-drop**: Assumed native HTML5 drag-and-drop is acceptable. Touch device support is not required for MVP.

9. **Auto-save behavior**: Assumed editor follows VSCode's configured auto-save settings (off, afterDelay, onFocusChange, onWindowChange). No custom auto-save logic needed.

10. **Theme switching**: Assumed VSCode provides theme change events that webviews can listen to. Editor should update within 500ms of theme change.
