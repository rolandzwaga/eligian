# Feature Specification: Eligian Timeline Preview

**Feature Branch**: `001-i-want-to`
**Created**: 2025-10-18
**Status**: Draft
**Input**: User description: "I want to add a preview command and view to the VS Code extension. This preview will first compile the current .eligian file and then show a WebView that creates and runs an Eligius engine that loads and renders the compiled code"

## User Scenarios & Testing

### User Story 1 - Instant Timeline Preview (Priority: P1)

As an Eligian developer, I want to preview my timeline without leaving VS Code, so I can immediately see the visual output of my code and iterate quickly without manual build/deploy steps.

**Why this priority**: This is the core value proposition - enabling rapid iteration and visual feedback during development. Without this, developers must manually compile, deploy to a test environment, and refresh to see changes.

**Independent Test**: Can be fully tested by opening an `.eligian` file, triggering the preview command, and verifying that a visual timeline playback appears. Delivers immediate value by showing the compiled timeline running in real-time.

**Acceptance Scenarios**:

1. **Given** I have an `.eligian` file open in the editor, **When** I invoke the "Preview Timeline" command, **Then** a webview panel opens showing my timeline running with the Eligius engine
2. **Given** I have a valid timeline with video provider, **When** I preview it, **Then** the video plays according to the timeline events I defined
3. **Given** I have a timeline with animations (RAF provider), **When** I preview it, **Then** the animations execute according to my timeline specification

---

### User Story 2 - Live Preview Updates (Priority: P2)

As an Eligian developer, I want the preview to automatically update when I save my file, so I can see my changes immediately without re-running the preview command.

**Why this priority**: Reduces friction during development - save-to-see workflow is standard in modern dev tools. Significantly improves developer experience but the preview can work without it.

**Independent Test**: Can be tested by opening preview, making a change to the `.eligian` file, saving, and verifying the preview updates automatically. Works independently of other features.

**Acceptance Scenarios**:

1. **Given** I have a preview open, **When** I modify my `.eligian` file and save, **Then** the preview automatically recompiles and updates to show my changes
2. **Given** I have a preview open with an error, **When** I fix the error and save, **Then** the preview updates to show the corrected timeline
3. **Given** I have multiple `.eligian` files, **When** I switch between files with preview open, **Then** the preview updates to show the currently active file

---

### User Story 3 - Error Feedback in Preview (Priority: P2)

As an Eligian developer, I want to see compilation errors in the preview window, so I understand what's wrong without checking the console or problems panel.

**Why this priority**: Improves developer experience by providing error context where they're looking (the preview). However, preview can function without this - errors can be shown via VS Code's standard error mechanisms.

**Independent Test**: Can be tested by introducing a syntax error in an `.eligian` file, opening preview, and verifying clear error feedback is shown. Delivers value independently as an error reporting mechanism.

**Acceptance Scenarios**:

1. **Given** my `.eligian` file has a syntax error, **When** I open preview, **Then** the preview shows a clear error message with the line/column of the error
2. **Given** my timeline references an undefined action, **When** I preview it, **Then** the preview shows a validation error with the action name
3. **Given** my file compiles but has runtime errors, **When** the timeline plays in preview, **Then** runtime errors are displayed in the preview with helpful context

---

### User Story 4 - Timeline Playback Controls (Priority: P3)

As an Eligian developer, I want basic playback controls (play, pause, restart) in the preview, so I can test specific moments in my timeline without editing code.

**Why this priority**: Nice-to-have for testing but not essential for MVP. Developers can restart by re-triggering preview or editing the timeline start time in code.

**Independent Test**: Can be tested by opening preview and using play/pause/restart buttons to control timeline playback. Works independently of other features.

**Acceptance Scenarios**:

1. **Given** a timeline is playing in preview, **When** I click pause, **Then** the timeline playback pauses at the current time
2. **Given** a timeline is paused, **When** I click play, **Then** the timeline resumes from where it paused
3. **Given** a timeline is playing or paused, **When** I click restart, **Then** the timeline restarts from time 0

---

### User Story 5 - EventBus Debug Viewer (Priority: P3)

As an Eligian developer debugging complex timelines, I want to see all EventBus events in real-time, so I can understand the sequence of events and diagnose timing or state issues.

**Why this priority**: Development/debugging tool that helps understand internal engine behavior. Not essential for basic timeline development but very valuable for debugging complex interactions and custom operations.

**Independent Test**: Can be tested by opening preview, enabling the debug viewer, and verifying that all EventBus events (play, pause, timeline events, custom events) are displayed with their arguments.

**Acceptance Scenarios**:

1. **Given** I have a preview open, **When** I click the "Debug Events" button in the control bar, **Then** a floating debug panel appears showing all EventBus events in real-time
2. **Given** the debug viewer is open, **When** timeline events fire (play, pause, stop, time updates), **Then** each event appears in the list with timestamp, event name, topic, and arguments
3. **Given** the debug viewer shows many events, **When** I use the filter input, **Then** only events matching the filter (by name or topic) are displayed
4. **Given** the debug viewer is visible, **When** I drag its title bar, **Then** I can reposition it anywhere on the screen
5. **Given** the debug viewer is open, **When** I click the "Debug Events" button again, **Then** the viewer closes/hides

---

### Edge Cases

- What happens when an `.eligian` file is empty or contains only comments?
- How does the preview handle very long timelines (e.g., 1 hour duration)?
- What happens when a timeline references external media files that don't exist?
- How does the preview handle timelines with multiple providers or complex synchronization?
- What happens when the user closes the webview and triggers preview again?
- How does the preview handle rapid file changes (user saves multiple times quickly)?
- What happens if the Eligius engine fails to load in the webview?
- How does the preview handle `.eligian` files that reference other `.eligian` files or external actions?

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a command to trigger timeline preview from an open `.eligian` file
- **FR-002**: System MUST compile the current `.eligian` file to Eligius JSON when preview is triggered
- **FR-003**: System MUST display compilation errors to the user if compilation fails
- **FR-004**: System MUST open a webview panel that loads the Eligius engine runtime
- **FR-005**: System MUST pass the compiled Eligius JSON configuration to the webview
- **FR-006**: System MUST initialize and start the Eligius engine with the compiled configuration in the webview
- **FR-007**: System MUST render the timeline execution visually in the webview (video playback, animations, DOM manipulations)
- **FR-008**: System MUST handle video, audio, and RAF (animation frame) timeline providers
- **FR-009**: System MUST watch the active `.eligian` file for changes when preview is open
- **FR-010**: System MUST automatically recompile and update preview when the file is saved
- **FR-011**: System MUST handle multiple `.eligian` files and update preview to match the currently active file
- **FR-012**: System MUST clean up Eligius engine resources when preview is closed
- **FR-013**: System MUST provide visual indication when preview is loading/compiling
- **FR-014**: System MUST display runtime errors from the Eligius engine in the preview
- **FR-015**: Preview MUST be accessible via command palette (e.g., "Eligian: Preview Timeline")
- **FR-016**: Preview MUST be accessible via context menu when right-clicking an `.eligian` file
- **FR-017**: Preview MUST be accessible via keyboard shortcut `Ctrl+K V` (Windows/Linux) or `Cmd+K V` (Mac), following VS Code's Markdown preview convention
- **FR-018**: System MUST provide a toggle button in the preview control bar to show/hide the EventBus debug viewer
- **FR-019**: Debug viewer MUST register as an EventBus listener and display all events in real-time
- **FR-020**: Debug viewer MUST show event timestamp, event name, topic (if present), and arguments for each event
- **FR-021**: Debug viewer MUST be draggable by its title bar to allow repositioning on screen
- **FR-022**: Debug viewer MUST provide filtering capability to filter events by name or topic
- **FR-023**: Debug viewer MUST persist its visibility state (open/closed) across preview updates

### Key Entities

- **Timeline Configuration**: The compiled Eligius JSON configuration that represents the user's `.eligian` file, containing all timeline actions, events, and provider settings
- **Webview Panel**: The VS Code webview container that hosts the preview, isolates the Eligius engine runtime, and provides the visual rendering surface
- **Eligius Engine Instance**: The running instance of the Eligius engine within the webview that interprets and executes the timeline configuration
- **Media Resources**: External files (video, audio, images) referenced by the timeline that must be accessible to the webview

## Success Criteria

### Measurable Outcomes

- **SC-001**: Developers can preview a valid timeline in under 3 seconds from triggering the command
- **SC-002**: Preview updates appear within 2 seconds of saving file changes
- **SC-003**: Preview correctly renders 95% of valid `.eligian` files without errors
- **SC-004**: Developers can iterate on timelines 3x faster than manual compile/deploy/test workflow
- **SC-005**: Preview handles timelines with up to 100 events without performance degradation
- **SC-006**: Error messages in preview allow developers to identify and fix issues in under 1 minute

## Assumptions

- Eligius engine can run in a browser/webview environment (requires bundled version - bundling approach chosen in plan.md)
- VS Code webview APIs support the necessary resource loading and communication patterns
- Media files (video/audio) referenced in timelines are accessible from the webview context
- Standard web-based playback controls are sufficient (no need for advanced scrubbing/timeline navigation in MVP)
- Developers are working with local files (not remote workspaces) for MVP
- Default keyboard shortcut follows VS Code conventions (similar to Markdown preview patterns)

## Dependencies

- Eligius engine must be available as a browser-compatible bundle (ES modules or UMD)
- Existing Eligian compiler in the language package must be accessible from VS Code extension
- VS Code Webview API for creating and managing preview panels
- File system watcher for detecting `.eligian` file changes
