# Feature Specification: Custom Action Reference Provider

**Feature Branch**: `007-custom-action-reference`
**Created**: 2025-10-24
**Status**: Draft
**Input**: User description: "custom action reference provider. I need you to create a Langium custom reference provider for custom actions that are called with timeline actions, in order to support 'Go To Definition' functionality in VS Code. This involves a lot of research so use context7 to do this."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate to Action Definition from Direct Timeline Calls (Priority: P1)

As a developer writing Eligian timelines, I want to Ctrl+Click (or F12) on a custom action call like `fadeIn("#box", 1000)` inside a timeline event and jump directly to the action definition, so I can quickly review the action's implementation without manually searching the file.

**Why this priority**: This is the most common use case - developers frequently call custom actions inside timeline events and need to understand what those actions do. Without this, developers must manually scroll through the file to find action definitions, which is slow and error-prone.

**Independent Test**: Can be fully tested by creating a `.eligian` file with one action definition and one timeline that calls it, then verifying that Ctrl+Click on the call navigates to the definition. Delivers immediate value for the most common workflow.

**Acceptance Scenarios**:

1. **Given** a file with `action fadeIn(selector, duration) [...]` and a timeline with `at 0s..1s fadeIn("#box", 1000)`, **When** user Ctrl+Clicks on `fadeIn` in the timeline event, **Then** cursor jumps to the action definition line
2. **Given** a file with multiple action definitions and a timeline calling one of them, **When** user presses F12 on the action call, **Then** IDE navigates to the correct action definition (not a different action with similar name)
3. **Given** a timeline calling a non-existent action `unknownAction()`, **When** user tries to navigate with Ctrl+Click, **Then** IDE shows "No definition found" or similar message (no crash)

---

### User Story 2 - Navigate from Inline Endable Action Blocks (Priority: P1)

As a developer using inline endable action blocks in timelines, I want to Ctrl+Click on custom action calls inside inline blocks like `at 0s..3s [ fadeIn("#box", 1000) ] [ fadeOut() ]` and navigate to the action definition, so I can understand nested action behavior.

**Why this priority**: Inline endable blocks are a core timeline feature, and developers frequently call custom actions inside them. This is just as common as direct timeline calls (US1), making it equally critical for developer productivity.

**Independent Test**: Can be tested by creating a timeline with inline endable blocks containing custom action calls, then verifying navigation works. Delivers value for inline block workflows independently of other navigation features.

**Acceptance Scenarios**:

1. **Given** a timeline with `at 0s..3s [ fadeIn("#box", 1000) ] []`, **When** user Ctrl+Clicks on `fadeIn` inside the start block, **Then** cursor jumps to the fadeIn action definition
2. **Given** a timeline with `at 0s..3s [] [ fadeOut("#box", 500) ]`, **When** user Ctrl+Clicks on `fadeOut` inside the end block, **Then** cursor jumps to the fadeOut action definition
3. **Given** inline blocks with multiple action calls like `[ fadeIn() ↵ slideIn() ]`, **When** user navigates from either call, **Then** IDE jumps to the correct action definition for the clicked call

---

### User Story 3 - Navigate from Sequence Blocks (Priority: P2)

As a developer using sequence syntax for animations, I want to Ctrl+Click on custom action calls inside sequence blocks like `sequence { fadeIn() for 1s, slideIn() for 2s }` and navigate to action definitions, so I can review sequenced action implementations.

**Why this priority**: Sequence blocks are used for declarative animation sequencing. While important, they're less common than direct timeline calls and inline blocks, making this P2. Developers still need navigation here, but it's not the primary workflow.

**Independent Test**: Can be tested independently by creating a timeline with sequence blocks containing custom action calls, verifying navigation works within sequences. Delivers value for sequence-based workflows.

**Acceptance Scenarios**:

1. **Given** a timeline with `sequence { fadeIn() for 1s }`, **When** user Ctrl+Clicks on `fadeIn`, **Then** cursor jumps to the action definition
2. **Given** a sequence with multiple actions like `sequence { fadeIn() for 1s, slideIn() for 2s }`, **When** user navigates from any action call, **Then** IDE jumps to the correct definition for that specific call
3. **Given** nested sequences with action calls, **When** user navigates from an inner sequence action, **Then** IDE correctly resolves the action reference (no scope confusion)

---

### User Story 4 - Navigate from Stagger Blocks (Priority: P2)

As a developer using stagger syntax for batch animations, I want to Ctrl+Click on custom action calls inside stagger blocks like `stagger 200ms items with fadeIn() for 1s` and navigate to action definitions, so I can understand staggered action behavior.

**Why this priority**: Stagger blocks are used for declarative batch animations. Like sequences, they're important but less common than direct timeline calls, making this P2. Navigation support here improves developer experience but isn't the primary workflow.

**Independent Test**: Can be tested independently by creating a timeline with stagger blocks containing custom action calls, verifying navigation works within staggers. Delivers value for stagger-based workflows.

**Acceptance Scenarios**:

1. **Given** a timeline with `stagger 200ms items with fadeIn() for 1s`, **When** user Ctrl+Clicks on `fadeIn`, **Then** cursor jumps to the action definition
2. **Given** a stagger block with multiple action calls in the body, **When** user navigates from any action call, **Then** IDE jumps to the correct definition
3. **Given** stagger blocks nested inside other timeline constructs, **When** user navigates from a stagger action call, **Then** IDE correctly resolves the reference without scope errors

---

### User Story 5 - Find All References to Custom Actions (Priority: P3)

As a developer refactoring custom actions, I want to right-click on an action definition and select "Find All References" to see all places where the action is called in the timeline, so I can assess the impact of changes before refactoring.

**Why this priority**: "Find All References" is a valuable refactoring tool but is less frequently used than "Go to Definition". Developers primarily need to navigate TO definitions (P1/P2 stories), not FROM them. This is a nice-to-have quality-of-life feature.

**Independent Test**: Can be tested independently by creating a file with one action definition and multiple calls, then verifying "Find All References" shows all call sites. Delivers value for refactoring workflows separately from navigation.

**Acceptance Scenarios**:

1. **Given** a file with `action fadeIn() [...]` called in 3 different timeline events, **When** user right-clicks on the action definition and selects "Find All References", **Then** IDE shows a list of all 3 call sites with file locations and line previews
2. **Given** an action that is defined but never called, **When** user finds all references, **Then** IDE shows "0 references found" or similar message (no crash)
3. **Given** multiple actions with similar names (fadeIn, fadeInSlow), **When** user finds references for fadeIn, **Then** IDE only shows fadeIn references, not fadeInSlow references (no false positives)

---

### Edge Cases

- **What happens when an action is renamed?** The custom reference provider should detect broken references and show "Unknown operation" errors for calls to the old name. If Langium's rename refactoring is integrated (out of scope for this feature), references should update automatically.

- **What happens when an action calls another custom action?** Navigation should work recursively - if `actionA` calls `actionB`, Ctrl+Click on `actionB()` inside `actionA`'s body should navigate to `actionB`'s definition. The scope provider must resolve action references in action bodies, not just timelines.

- **What happens with circular action references?** If `actionA` calls `actionB` which calls `actionA`, the validator should already flag this as an error. The reference provider should still resolve references correctly (allow navigation), but validation prevents infinite loops at compile time.

- **What happens when multiple actions have the same name?** The validator should already prevent duplicate action definitions. The reference provider should only resolve to the first/only definition with that name. If duplicates exist (validation bug), reference provider should resolve to the first occurrence.

- **What happens when navigating from action calls inside control flow?** Navigation should work inside `if` statements, `for` loops, and other control structures within timeline events. The scope provider must handle nested AST contexts correctly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST resolve custom action references in direct timeline event calls (e.g., `at 0s..1s fadeIn()`)
- **FR-002**: System MUST resolve custom action references in inline endable action blocks (e.g., `at 0s..3s [ fadeIn() ] []`)
- **FR-003**: System MUST resolve custom action references in sequence blocks (e.g., `sequence { fadeIn() for 1s }`)
- **FR-004**: System MUST resolve custom action references in stagger blocks (e.g., `stagger 200ms items with fadeIn() for 1s`)
- **FR-005**: System MUST resolve custom action references in action bodies (e.g., `action a [b()]` where `b` is another custom action)
- **FR-006**: System MUST implement a custom ScopeProvider that extends Langium's DefaultScopeProvider to resolve action names to ActionDefinition AST nodes
- **FR-007**: System MUST integrate with Langium's LSP References service to provide "Go to Definition" functionality in VS Code
- **FR-008**: System MUST distinguish between custom action calls and built-in operation calls (e.g., `fadeIn()` vs `selectElement()`)
- **FR-009**: System MUST handle references to non-existent actions gracefully (show "No definition found" message, not crash)
- **FR-010**: System MUST track source locations (line, column) for all action definitions to enable accurate navigation
- **FR-011**: System MUST support "Find All References" functionality (show all call sites for a given action definition)
- **FR-012**: System MUST not modify the existing grammar (no changes to `OperationCall` or `ActionDefinition` rules)

### Key Entities *(include if feature involves data)*

- **ActionDefinition**: Represents a custom action definition in the DSL. Key attributes: `name` (string), `parameters` (list), `operations` (list of AST nodes), source location (line, column, file path). Used as the resolution target for action references.

- **OperationCall**: Represents a call to either a custom action or built-in operation. Key attributes: `operationName` (string), `args` (list of expressions), source location. Used as the reference source for action lookups.

- **ReferenceInfo**: Langium type representing a reference resolution context. Key attributes: `reference` (the reference object), `container` (parent AST node), `property` (property name being resolved), `index` (if reference is in array). Used by ScopeProvider to determine what to resolve.

- **Scope**: Langium type representing a set of available symbols for reference resolution. Contains a collection of AST nodes that can be referenced. Returned by ScopeProvider's `getScope()` method.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Navigation from custom action calls to definitions completes in under 1 second for files with up to 100 action definitions (performance benchmark)

- **SC-002**: System correctly resolves 100% of valid custom action calls across all timeline contexts (direct calls, inline blocks, sequences, staggers, action bodies) when tested with comprehensive fixture suite

- **SC-003**: System produces zero false positives (no navigation to incorrect definitions) and zero false negatives (no "not found" errors for valid references) when tested with 50+ action call scenarios

- **SC-004**: "Find All References" returns complete and accurate results (all call sites, no duplicates, no missing references) for 100% of action definitions in test suite

- **SC-005**: Navigation feature works immediately after implementation without requiring any VS Code extension configuration changes (zero additional setup burden)

- **SC-006**: System introduces no measurable performance degradation (under 5% increase in LSP response time) for existing language server operations like validation and completion

- **SC-007**: 90% of developers use the navigation feature within first week of release without reading documentation (intuitive discoverability via Ctrl+Click)

## Assumptions

- **Single-document references only**: Custom actions can only be called within the same `.eligian` file where they are defined. Cross-file action imports are out of scope. The reference provider will only search for action definitions in the current document.

- **Langium LSP integration works**: The VS Code extension is already properly configured with Langium's language server, and LSP features like diagnostics and completion are working. The reference provider will integrate into this existing infrastructure.

- **Action names are unique per file**: The validator already prevents duplicate action definitions in the same file. The reference provider can assume each action name resolves to exactly one definition (or zero if invalid).

- **OperationCall unification is complete**: Custom action calls and built-in operation calls both use the `OperationCall` AST node type (Feature 006 is complete). The reference provider will distinguish them by checking if the operation name matches an action definition.

## Out of Scope

- **Cross-file action references**: Importing actions from other `.eligian` files and resolving references across file boundaries. This would require a module system (not yet implemented).

- **Rename refactoring**: Automatically updating all action call sites when an action definition is renamed. This would require integrating with Langium's rename provider (separate feature).

- **Hover hints for action calls**: Showing action signatures or documentation when hovering over action calls. This would require a custom hover provider (separate feature).

- **Code completion for action names**: Auto-completing action names when typing in timeline events. This would require extending the completion provider (separate feature, may be implemented in Phase 3 of type system).

- **Action signature validation at call sites**: Type-checking action arguments against parameter types at call sites. This is handled by the existing validator and type system (Phase 18), not the reference provider.

## Open Questions

None at this time. All requirements are clear based on the user's description and research into Langium's reference resolution architecture.
