# Feature Specification: Preview CSS Support with Live Reload

**Feature Branch**: `011-preview-css-support`
**Created**: 2025-10-25
**Status**: Draft
**Input**: User description: "preview css support. In the previous feature we added the css asset import. Now, in the preview we will need to load this css into the webview, and when the css file on disk changes the webview should live reload it. It shouldn't restart the entire eligius engine, only relead the css in the page."

## User Scenarios & Testing

### User Story 1 - Apply Imported CSS in Preview (Priority: P1)

When a developer imports a CSS file in their Eligian file, the preview webview should automatically load and apply that CSS to the rendered timeline, allowing them to see their styling immediately without manual intervention.

**Why this priority**: This is the core functionality - without CSS loading, the preview feature is incomplete. Developers expect imported stylesheets to be applied automatically, just like in production.

**Independent Test**: Can be fully tested by importing a CSS file in an Eligian file, opening the preview, and verifying that the styles are applied to the preview content. Delivers immediate visual feedback of styling.

**Acceptance Scenarios**:

1. **Given** an Eligian file with `styles "./styles.css"` import, **When** the preview is opened, **Then** the CSS file is loaded and applied to the preview webview
2. **Given** multiple CSS imports in an Eligian file, **When** the preview is opened, **Then** all imported CSS files are loaded in the order they appear
3. **Given** a preview is already open, **When** a CSS import is added to the Eligian file and saved, **Then** the new CSS file is loaded into the preview without restarting

---

### User Story 2 - Live Reload CSS on File Change (Priority: P2)

When a developer edits and saves a CSS file that's imported in their Eligian file, the preview should automatically reload that CSS file and apply the changes without restarting the Eligius engine or losing the current timeline state.

**Why this priority**: Live reload dramatically improves developer experience by providing instant feedback on CSS changes. This enables rapid iteration on styling without disrupting the timeline playback.

**Independent Test**: Can be fully tested by modifying an imported CSS file while the preview is open, saving it, and verifying that changes appear in the preview immediately without timeline restart. Delivers hot reload development experience.

**Acceptance Scenarios**:

1. **Given** a preview with imported CSS is running, **When** the CSS file is modified and saved, **Then** the preview reloads only the CSS without restarting the Eligius engine
2. **Given** a timeline is playing in the preview, **When** a CSS file is modified, **Then** the timeline continues playing while the CSS updates
3. **Given** multiple CSS files are imported, **When** one CSS file changes, **Then** only that file is reloaded, not all CSS files
4. **Given** a CSS file change occurs during an animation, **When** the CSS reloads, **Then** the animation continues smoothly without interruption

---

### User Story 3 - Handle CSS File Errors Gracefully (Priority: P3)

When a CSS file has syntax errors or cannot be loaded, the preview should display a clear error message and continue functioning with the previous valid CSS, allowing the developer to fix the issue without losing their work.

**Why this priority**: Error handling improves developer experience by preventing complete preview failures from CSS issues. While important, it's lower priority than core loading and reload functionality.

**Independent Test**: Can be fully tested by introducing CSS syntax errors or removing CSS files, then verifying the preview shows helpful error messages and remains functional with previous valid styles.

**Acceptance Scenarios**:

1. **Given** a preview is open, **When** an imported CSS file has syntax errors, **Then** the preview displays an error notification and retains the previous valid CSS
2. **Given** a preview is open, **When** an imported CSS file is deleted from disk, **Then** the preview shows a "file not found" error and continues with other loaded CSS
3. **Given** a CSS file fails to load, **When** the file is fixed and saved, **Then** the preview automatically reloads the corrected CSS

---

### Edge Cases

- What happens when a CSS file import path is invalid or the file doesn't exist?
- How does the system handle CSS files that are being actively edited (file locked by another process)?
- What happens if a CSS file is renamed while the preview is open?
- How are CSS files with @import directives handled?
- What happens if a CSS file is extremely large (>1MB)?
- How does the system handle CSS files with relative URL paths (background images, fonts)?
- What happens when the file watcher detects rapid changes (e.g., during auto-save)?
- How are CSS files on network drives or slow file systems handled?

## Requirements

### Functional Requirements

- **FR-001**: Preview webview MUST load all CSS files imported via `styles` statements in the Eligian file
- **FR-002**: Preview MUST maintain CSS load order matching the order of imports in the Eligian file
- **FR-003**: System MUST watch imported CSS files for changes on disk
- **FR-004**: When a CSS file changes, preview MUST reload only that specific CSS file without restarting the Eligius engine
- **FR-005**: CSS reload MUST preserve the current timeline state (playback position, data, element states)
- **FR-006**: System MUST convert file system paths to webview-compatible URIs for CSS loading
- **FR-007**: Preview MUST display error notifications when CSS files fail to load or have syntax errors
- **FR-008**: System MUST continue functioning with previously loaded CSS when a reload fails
- **FR-009**: CSS file watchers MUST be cleaned up when the preview is closed or the Eligian file changes
- **FR-010**: System MUST debounce rapid file changes to avoid excessive reloads (e.g., during auto-save)
- **FR-011**: Preview MUST handle both absolute and relative CSS file paths correctly
- **FR-012**: System MUST stop watching CSS files from old imports when the Eligian file is modified to remove those imports

### Key Entities

- **CSS File Watcher**: Monitors imported CSS files for changes, triggers reload events when modifications are detected, manages cleanup of file system listeners
- **CSS Loader**: Handles loading CSS files from disk, converting paths to webview URIs, injecting styles into the webview, managing load order
- **Preview State**: Maintains the current state of the Eligius timeline (playback position, data, element states) to preserve during CSS reloads
- **Error Handler**: Captures and displays CSS loading errors, maintains fallback to previous valid CSS, provides actionable error messages

## Success Criteria

### Measurable Outcomes

- **SC-001**: Imported CSS files appear in the preview within 500ms of opening the preview
- **SC-002**: CSS file changes are reflected in the preview within 300ms of saving the file
- **SC-003**: Timeline playback continues uninterrupted during CSS reloads (no visible pause or restart)
- **SC-004**: Developers can iterate on CSS styling without manually refreshing the preview
- **SC-005**: System correctly loads and maintains order for up to 10 imported CSS files
- **SC-006**: CSS reload preserves 100% of timeline state (position, data, element states)
- **SC-007**: Error messages for CSS issues are clear and actionable (include file path and error type)

## Scope

### In Scope

- Loading CSS files imported via `styles` statements into the preview webview
- Watching imported CSS files for changes using file system watchers
- Hot-reloading CSS without restarting the Eligius engine or losing timeline state
- Displaying error notifications for CSS loading failures
- Converting file system paths to webview-compatible URIs
- Managing CSS load order based on import order
- Cleaning up file watchers on preview close or file change

### Out of Scope

- CSS preprocessing (SASS, LESS, PostCSS) - files must be pre-compiled CSS
- CSS minification or optimization - files are loaded as-is
- CSS validation or linting beyond browser parsing
- Editing CSS files within VS Code (use standard editor features)
- CSS sourcemap support for debugging
- Live reload for HTML layout files (separate feature)
- Live reload for Eligian DSL files (already handled by existing preview update mechanism)
- CSS file bundling or concatenation

## Assumptions

- VS Code's webview API supports dynamic CSS injection and removal
- VS Code's file system watcher (workspace.createFileSystemWatcher) works reliably for CSS files
- Eligius engine supports CSS changes without reinitialization
- The preview already has a mechanism to inject and execute code in the webview
- CSS files are standard CSS (not preprocessor syntax) at the time of import
- File paths in CSS (background-image, @font-face) are relative to the CSS file location
- Developers are running the preview in a local file system environment (not remote)

## Dependencies

- **Feature 010** (Asset Import Syntax): Depends on CSS imports being parsed and validated in the Eligian compiler
- **VS Code Webview API**: Requires webview message passing for CSS injection
- **VS Code File System Watcher API**: Requires workspace.createFileSystemWatcher for monitoring CSS files
- **Eligius Engine**: Must support CSS updates without full reinitialization

## Risks & Mitigations

### Risk 1: File Watcher Performance

**Description**: Watching many CSS files could impact VS Code performance or consume excessive resources.

**Mitigation**:
- Limit the number of watched CSS files (max 10 as per SC-005)
- Use debouncing to avoid excessive reload events
- Clean up watchers immediately when no longer needed
- Dispose watchers when the preview is closed

### Risk 2: Webview CSS Injection Race Conditions

**Description**: Rapid CSS changes could cause race conditions where multiple CSS versions are injected simultaneously.

**Mitigation**:
- Queue CSS reload requests and process them sequentially
- Debounce file change events (e.g., 100ms delay)
- Remove old CSS before injecting new CSS for the same file

### Risk 3: Timeline State Corruption

**Description**: CSS changes could inadvertently affect timeline state if Eligius reinitializes on CSS update.

**Mitigation**:
- Verify Eligius engine doesn't reinitialize on CSS changes
- Test that timeline state (position, data) is preserved during reload
- If needed, implement state preservation by capturing and restoring state around CSS reload

### Risk 4: CSS Path Resolution in Webview

**Description**: Relative paths in CSS (images, fonts) may not resolve correctly in webview context.

**Mitigation**:
- Use VS Code's `asWebviewUri` API to convert file paths
- Test CSS with background-image and @font-face declarations
- Document any path resolution limitations
