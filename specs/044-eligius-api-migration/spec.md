# Feature Specification: Eligius 2.0.0 API Migration

**Feature Branch**: `044-eligius-api-migration`
**Created**: 2025-12-11
**Status**: Draft
**Input**: User description: "Migrate codebase to Eligius 2.0.0 API - update EngineFactory.createEngine() usage to destructure IEngineFactoryResult, update destroy logic to use factoryResult.destroy(), and fix generated runtime bundler code"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview Panel Engine Lifecycle (Priority: P1)

As a developer using the VS Code extension preview panel, I want the Eligius engine to initialize and clean up correctly so that I can preview my timelines without errors or memory leaks.

**Why this priority**: The preview panel is the primary user-facing feature that directly uses the Eligius engine. Without correct engine lifecycle management, the extension is non-functional.

**Independent Test**: Can be fully tested by opening a `.eligian` file, triggering the preview command, verifying the engine initializes, and closing the panel to verify proper cleanup.

**Acceptance Scenarios**:

1. **Given** a valid `.eligian` file is open, **When** the user triggers the preview command, **Then** the Eligius engine initializes successfully and the timeline is ready for playback.

2. **Given** the preview panel is open with an active engine, **When** the user closes the preview panel, **Then** all engine resources are properly cleaned up (adapters disconnected, event listeners removed, DOM cleaned).

3. **Given** the preview panel is open with an active engine, **When** the user opens a different `.eligian` file in the same panel, **Then** the previous engine is properly destroyed before the new one initializes.

4. **Given** the preview panel engine has already been destroyed, **When** destroy is called again (e.g., rapid close/reopen), **Then** the operation completes without errors (idempotent behavior per FR-007).

---

### User Story 2 - CLI Runtime Bundle Generation (Priority: P2)

As a developer using the CLI to generate standalone bundles, I want the generated runtime code to use the correct Eligius API so that the bundled timeline runs correctly in a browser.

**Why this priority**: The CLI bundler generates deployment artifacts. Incorrect generated code would cause runtime failures in production, but this is a less frequent use case than the preview panel.

**Independent Test**: Can be fully tested by running the CLI bundle command on a sample `.eligian` file and verifying the generated JavaScript code initializes the engine correctly.

**Acceptance Scenarios**:

1. **Given** a valid `.eligian` file, **When** the CLI generates a runtime bundle, **Then** the generated initialization code correctly destructures the factory result to obtain the engine instance.

2. **Given** a generated runtime bundle, **When** the bundle is loaded in a browser, **Then** the Eligius engine initializes and the timeline plays correctly.

---

### User Story 3 - Engine Playback Controls (Priority: P3)

As a developer using the preview panel, I want playback controls (play, pause, stop, restart) to work correctly so that I can test my timeline at different points.

**Why this priority**: Playback controls depend on the eventbus integration which is handled by the new adapter pattern. This is important but relies on US1 being complete first.

**Independent Test**: Can be fully tested by using the preview panel controls and verifying timeline responds to play/pause/stop/restart commands.

**Acceptance Scenarios**:

1. **Given** the preview panel is open with an initialized engine, **When** the user clicks play, **Then** the timeline starts playing.

2. **Given** the timeline is playing, **When** the user clicks pause, **Then** playback pauses at the current position.

3. **Given** the timeline is paused or stopped, **When** the user clicks restart, **Then** the timeline resets to the beginning and starts playing.

---

### Edge Cases

- What happens when engine initialization fails due to invalid configuration?
  - The preview panel should display an error message and remain in a stable state.

- What happens when destroy is called on an already-destroyed engine?
  - The operation should be idempotent and not throw errors.

- What happens when the user rapidly opens/closes preview panels?
  - Each close should properly destroy the previous engine before a new one is created.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST destructure `IEngineFactoryResult` when calling `EngineFactory.createEngine()` to obtain the engine instance.

- **FR-002**: System MUST store the factory result object to access the `destroy()` method for proper cleanup.

- **FR-003**: System MUST call `factoryResult.destroy()` instead of `engine.destroy()` to ensure adapters are properly disconnected.

- **FR-004**: System MUST import the `IEngineFactoryResult` type from the `eligius` package where factory results are stored.

- **FR-005**: Generated runtime bundle code MUST destructure the factory result when initializing the engine.

- **FR-006**: System MUST maintain backwards compatibility with existing eventbus event patterns for playback controls.

- **FR-007**: System MUST handle the case where the factory result's destroy method is called multiple times without errors.

### Key Entities

- **IEngineFactoryResult**: New return type from `createEngine()` containing `engine`, `languageManager`, `eventbus`, and `destroy()` method.

- **EngineFactory**: Factory class that creates and wires engine instances with adapters.

- **Adapters**: New bridge components (EngineEventbusAdapter, LanguageEventbusAdapter, EngineInputAdapter) that connect engine/language manager to the eventbus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Preview panel successfully initializes and displays timelines without errors after migration.

- **SC-002**: Preview panel closes without memory leaks or console errors (verified by 3-5 open/close cycles with DevTools heap snapshot comparison showing no retained engine objects).

- **SC-003**: Generated CLI bundles execute successfully in a browser environment.

- **SC-004**: All existing tests pass after migration changes are applied.

- **SC-005**: Playback controls (play, pause, stop, restart) function correctly in the preview panel.

- **SC-006**: Build process completes without TypeScript compilation errors related to Eligius types.

## Assumptions

- The Eligius 2.0.0 API maintains backwards compatibility for `IEngineConfiguration` structure (no changes to compiled output format).
- The eventbus event names and patterns remain unchanged (e.g., `timeline-play-request`, `timeline-pause-request`).
- The `IEventbus` and `IEventbusListener` interfaces remain compatible.
- The preview panel's existing event-based communication with the webview remains functional.

## Out of Scope

- Adopting new Eligius 2.0.0 features (TypedEventEmitter direct subscriptions, new adapter patterns in custom code).
- Updating to use engine property accessors (`engine.position`, `engine.duration`, `engine.playState`).
- Removing the eventbus in favor of direct engine event subscriptions.
