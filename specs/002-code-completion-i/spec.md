# Feature Specification: Code Completion for Eligian DSL

**Feature Branch**: `002-code-completion-i`
**Created**: 2025-10-19
**Status**: ✅ MVP Complete (Phases 1-4) | ⏸️ Remaining deferred pending type system
**Input**: User description: "code completion. I want to add some code completions now, I think the lowest hanging fruit are the operation names within action. I want to see an alphabetically sorted list that shows the operation's description in the completion dropdown, if possible. You can suggest other completions as well, let's first have a discussion and then add the spec"
**Completed**: 2025-10-19
**📋 Summary**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for full details.
**🚧 Deferred**: User Stories 3-6 blocked by missing type system - resume after type system implementation.


## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operation Name Completion (Priority: P1)

As a developer writing Eligian timeline code, when I start typing an operation name inside an action block, I want to see an alphabetically sorted list of available Eligius operations with their descriptions, so that I can quickly discover and use the correct operation without consulting external documentation.

**Why this priority**: This is the highest-value completion because operations are the most frequently typed elements in Eligian code. Developers currently need to memorize operation names or constantly reference Eligius documentation. This completion directly reduces cognitive load and increases productivity.

**Independent Test**: Can be fully tested by opening an `.eligian` file, typing within an action block, and verifying that operation completions appear with descriptions. Delivers immediate value by reducing documentation lookups.

**Acceptance Scenarios**:

1. **Given** a developer is editing an `.eligian` file with an action block, **When** they type the first letter of an operation name (e.g., "s"), **Then** the completion list appears showing all operations starting with "s" (e.g., `selectElement`, `setData`, `setStyle`) in alphabetical order with descriptions
2. **Given** the completion list is showing operation names, **When** the developer continues typing (e.g., "sel"), **Then** the list filters to show only matching operations (e.g., `selectElement`)
3. **Given** a developer selects an operation from the completion list, **When** they press Enter or Tab, **Then** the operation name is inserted at the cursor position
4. **Given** operations that are handled by DSL keywords exist in Eligius registry (e.g., `breakForEach`, `continueForEach`, `ifCondition`, `elseCondition`, `forEach`), **When** the completion list is displayed, **Then** these operations are filtered out and not shown
5. **Given** an operation has multiple parameters, **When** the developer views it in the completion list, **Then** the description includes parameter names, types, and default values

---

### User Story 2 - Custom Action Name Completion (Priority: P1)

As a developer writing Eligian timeline code, when I start typing within an action block, I want to see custom actions defined in the current document alongside Eligius operations, so that I can easily reuse my own actions without scrolling through the file to find their exact names.

**Why this priority**: Custom actions are just as important as built-in operations since they're used in the same context. Without this completion, developers must manually track action names across potentially large files. This is a natural extension of operation completion with minimal additional complexity.

**Independent Test**: Can be fully tested by defining custom actions in an `.eligian` file, then verifying they appear in completions within action blocks. Works independently of other completions.

**Acceptance Scenarios**:

1. **Given** a developer has defined custom actions in the current document (e.g., `action fadeIn`, `action slideUp`), **When** they type in an action block, **Then** the completion list shows both built-in operations and custom actions
2. **Given** the completion list contains both operations and custom actions, **When** VS Code supports grouping in completion lists, **Then** items are grouped under "Operations" and "Custom Actions" headers
3. **Given** the completion list contains both operations and custom actions, **When** VS Code does not support grouping, **Then** all items are shown in a single alphabetically sorted list with a prefix indicator (e.g., "🔧 " for operations, "📦 " for custom actions)
4. **Given** a custom action has parameters, **When** the developer views it in the completion list, **Then** the description shows the action's parameter signature
5. **Given** a developer selects a custom action from the completion list, **When** they press Enter or Tab, **Then** the action name is inserted at the cursor position

---

### User Story 3 - Keyword Completion (Priority: P2)

As a developer writing Eligian timeline code, when I start typing at a location where keywords are valid, I want to see suggestions for DSL keywords (e.g., `action`, `event`, `if`, `else`, `for`, `break`, `continue`), so that I can write syntactically correct code faster.

**Why this priority**: Keywords are less frequently typed than operations but still important for code structure. Context-aware filtering (e.g., only showing `break`/`continue` in loops) prevents errors and guides developers toward correct syntax.

**Independent Test**: Can be tested by typing in various contexts (top-level, inside actions, inside loops) and verifying appropriate keywords appear. Delivers value by reducing syntax errors.

**Acceptance Scenarios**:

1. **Given** a developer is typing at the top level of an `.eligian` file, **When** they trigger completion, **Then** keywords `action` and `event` appear in the list
2. **Given** a developer is typing inside an action block, **When** they trigger completion, **Then** keywords `if`, `else`, and `for` appear alongside operations and custom actions
3. **Given** a developer is typing inside a `for` loop, **When** they trigger completion, **Then** keywords `break` and `continue` appear in the list
4. **Given** a developer is typing outside a `for` loop, **When** they trigger completion, **Then** keywords `break` and `continue` do NOT appear in the list
5. **Given** a developer selects a keyword from the completion list, **When** they press Enter or Tab, **Then** the keyword is inserted at the cursor position

---

### User Story 4 - Timeline Event Name Completion (Priority: P2)

As a developer writing Eligian timeline code, when I define an event handler (e.g., `event timeline:play`), I want to see a list of available Eligius timeline event names with descriptions, so that I can accurately reference events without memorizing event name strings.

**Why this priority**: Event names are specific strings that must match exactly with Eligius runtime expectations. Auto-completion prevents typos and helps developers discover available events. Lower priority than operations because events are defined less frequently.

**Independent Test**: Can be tested by typing `event ` and verifying that timeline event names appear. Delivers value by preventing event name typos and improving event discovery.

**Acceptance Scenarios**:

1. **Given** a developer is typing an event definition, **When** they type `event ` (with space after keyword), **Then** the completion list shows all available timeline event names from Eligius (e.g., `timeline-play`, `timeline-pause`, `timeline-seeked`)
2. **Given** the completion list is showing event names, **When** the developer types additional characters (e.g., "play"), **Then** the list filters to show only matching events (e.g., `timeline-play`, `timeline-play-request`, `timeline-play-toggle-request`)
3. **Given** an event name has a description, **When** the developer views it in the completion list, **Then** the description is displayed alongside the event name
4. **Given** event names are categorized (e.g., "requests" vs "announcements"), **When** displaying in the completion list, **Then** events are alphabetically sorted within their categories or globally alphabetically sorted if grouping is not supported
5. **Given** a developer selects an event name from the completion list, **When** they press Enter or Tab, **Then** the event name is inserted at the cursor position

---

### User Story 5 - Variable Reference Completion (Priority: P3)

As a developer writing Eligian timeline code, when I start typing `@@` to reference a variable, I want to see suggestions for available variable references (e.g., `@@currentItem`, `@@timeline`, `@@context`), so that I can avoid typos and discover available context variables.

**Why this priority**: Variable references are important for accessing runtime context, but they're used less frequently than operations. This completion helps developers discover what context is available without deep documentation diving.

**Independent Test**: Can be tested by typing `@@` and verifying variable suggestions appear with type information. Delivers value by preventing variable name typos.

**Acceptance Scenarios**:

1. **Given** a developer is typing inside an action block, **When** they type `@@`, **Then** the completion list shows available variable references (e.g., `@@currentItem`, `@@timeline`, `@@context`)
2. **Given** the completion list is showing variable references, **When** the developer continues typing (e.g., "@@cur"), **Then** the list filters to show only matching variables (e.g., `@@currentItem`)
3. **Given** a variable reference has type information, **When** the developer views it in the completion list, **Then** the type/scope information is displayed
4. **Given** a developer is inside a `for` loop, **When** they type `@@`, **Then** `@@currentItem` appears in the completion list
5. **Given** a developer selects a variable reference from the completion list, **When** they press Enter or Tab, **Then** the variable reference is inserted at the cursor position

---

### User Story 6 - Parameter Name Completion (Priority: P3)

As a developer writing Eligian timeline code, when I am inside an operation or action call and typing parameter names, I want to see suggestions for valid parameter names with their types and default values, so that I can write correct operation calls without consulting documentation.

**Why this priority**: Parameter completion is highly valuable for complex operations with many parameters, but it requires understanding the current operation context. Lower priority because it's more complex to implement and requires cursor position analysis.

**Independent Test**: Can be tested by typing inside operation/action calls (e.g., `selectElement({...}`) and verifying parameter suggestions appear. Delivers value by reducing parameter lookup time and preventing parameter name typos.

**Acceptance Scenarios**:

1. **Given** a developer is typing inside an operation call's parameter object (e.g., `selectElement({s...}`), **When** they trigger completion, **Then** the completion list shows valid parameter names for that operation (e.g., `selector`, `useSelectedElementAsRoot`)
2. **Given** the completion list is showing parameter names, **When** a parameter is required, **Then** it is marked as required in the description
3. **Given** the completion list is showing parameter names, **When** a parameter has a type, **Then** the type is displayed (e.g., `selector: string`, `duration: number`)
4. **Given** the completion list is showing parameter names, **When** a parameter has a default value, **Then** the default value is displayed (e.g., `useSelectedElementAsRoot: boolean = false`)
5. **Given** a developer selects a parameter name from the completion list, **When** they press Enter or Tab, **Then** the parameter name is inserted with a colon and cursor positioned to enter the value (e.g., `selector: |` where `|` is cursor)
6. **Given** a developer is typing inside a custom action call's parameter object, **When** they trigger completion, **Then** the completion list shows parameter names from the custom action's signature

---

### Edge Cases

- **What happens when** the Eligius operation registry cannot be loaded or is malformed?
  - Completion should gracefully degrade: show keywords and custom actions, but no built-in operations. Log a warning to the developer console.

- **What happens when** multiple actions have the same name in different scopes?
  - Show all matching actions with scope qualifiers in the description (e.g., "fadeIn (current file)", "fadeIn (imported from utils)")

- **What happens when** a developer types very quickly and completion triggers lag?
  - Completion should debounce input to avoid performance issues. If computation takes too long, show a loading indicator in the completion list.

- **What happens when** a custom action is defined after the current cursor position?
  - Include actions defined anywhere in the current file (forward references are valid in Eligian)

- **What happens when** an operation or action has no description?
  - Show the item in the completion list with just the name/signature, no description text

- **What happens when** VS Code's completion API changes in future versions?
  - Extension should use stable VS Code APIs and handle API deprecations gracefully with fallback behavior

- **What happens when** a developer manually types an operation name without using completion?
  - No impact - completion is optional assistance, not required for code to work

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide code completion for Eligius operation names within action blocks
- **FR-002**: System MUST display operation completions in alphabetical order
- **FR-003**: System MUST show operation descriptions in the completion dropdown (from Eligius metadata)
- **FR-004**: System MUST filter out operations that are handled by DSL keywords (`breakForEach`, `continueForEach`, `ifCondition`, `elseCondition`, `forEach`)
- **FR-005**: System MUST provide code completion for custom action names defined in the current document
- **FR-006**: System MUST show custom actions alongside operations in the same completion context (within action blocks)
- **FR-007**: System MUST group completions under "Operations" and "Custom Actions" headers if VS Code supports grouping
- **FR-008**: System MUST use visual indicators (e.g., icons/prefixes) to distinguish operations from custom actions if grouping is not supported
- **FR-009**: System MUST provide code completion for DSL keywords (`action`, `event`, `if`, `else`, `for`, `break`, `continue`)
- **FR-010**: System MUST only suggest `break` and `continue` keywords when the cursor is inside a `for` loop
- **FR-011**: System MUST provide code completion for timeline event names when defining event handlers
- **FR-012**: System MUST source timeline event names from Eligius `timeline-event-names.ts` file
- **FR-013**: System MUST show event descriptions in the completion dropdown
- **FR-014**: System MUST provide code completion for variable references when typing `@@`
- **FR-015**: System MUST suggest variable references like `@@currentItem`, `@@timeline`, `@@context`
- **FR-016**: System MUST show variable type/scope information in completion descriptions
- **FR-017**: System MUST provide code completion for parameter names inside operation calls
- **FR-018**: System MUST provide code completion for parameter names inside custom action calls
- **FR-019**: System MUST show parameter types in completion descriptions (e.g., `selector: string`)
- **FR-020**: System MUST show parameter default values in completion descriptions when available
- **FR-021**: System MUST mark required parameters in completion descriptions
- **FR-022**: System MUST filter completion suggestions as the developer types
- **FR-023**: System MUST insert the selected completion at the cursor position when Enter or Tab is pressed
- **FR-024**: System MUST source operation metadata from Eligius operation registry (`src/operation/metadata/`)
- **FR-025**: System MUST gracefully handle missing or malformed operation metadata (show item without description)

### Key Entities

- **Operation Metadata**: Describes Eligius operations including name, description, parameters (with types, required flag, default values), and output properties. Sourced from `../eligius/src/operation/metadata/`.

- **Timeline Event**: Represents Eligius timeline events including event name and description. Sourced from `../eligius/src/timeline-event-names.ts`.

- **Custom Action**: Represents user-defined actions in the current Eligian document, including action name and parameter signature.

- **Completion Item**: VS Code completion API object containing label (display name), detail (signature/type info), documentation (description), kind (operation/action/keyword/variable), and sort text (for alphabetical ordering).

- **Parameter Metadata**: Describes operation/action parameters including name, type, required flag, default value, and description.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can discover and insert operation names without consulting external Eligius documentation 95% of the time
- **SC-002**: Completion suggestions appear within 100ms of typing trigger character
- **SC-003**: Developers experience 40% reduction in time spent looking up operation names and parameters
- **SC-004**: Code completion covers 100% of Eligius operations available in the operation metadata registry
- **SC-005**: Code completion covers 100% of timeline events defined in Eligius `timeline-event-names.ts`
- **SC-006**: Code completion correctly filters out 100% of keyword-replaced operations (`breakForEach`, `continueForEach`, `ifCondition`, `elseCondition`, `forEach`)
- **SC-007**: Developers successfully complete operation calls with correct parameter names on first attempt 80% of the time
- **SC-008**: Zero completion suggestions for `break`/`continue` keywords appear outside of loop contexts

## Assumptions

- **A-001**: The Eligius operation metadata in `../eligius/src/operation/metadata/` follows a consistent structure with `description`, `properties`, and `outputProperties` fields
- **A-002**: The Eligius `timeline-event-names.ts` file exports a class with static properties containing event names and JSDoc comments for descriptions
- **A-003**: VS Code's completion provider API is stable and supports the required features (labels, details, documentation, filtering)
- **A-004**: The Eligian language server has access to the parsed AST to determine completion context (inside action, inside loop, etc.)
- **A-005**: Custom actions are defined in the same file as the completion request (no cross-file action resolution in this phase)
- **A-006**: Operation metadata will be available at compile time (bundled with extension or generated during build)
- **A-007**: The completion system will use Langium's built-in completion provider infrastructure
- **A-008**: Performance is acceptable with up to 100 operations and 50 custom actions in the completion list
- **A-009**: Grouping support in VS Code completion API uses `CompletionItemKind` or similar mechanisms
- **A-010**: Developers are using VS Code version 1.60+ (modern completion API available)

## Dependencies

- **Eligius Library**: Operation metadata must be accessible from `../eligius/src/operation/metadata/`
- **Eligius Timeline Events**: Event names and descriptions from `../eligius/src/timeline-event-names.ts`
- **Langium Framework**: Language server infrastructure for completion providers
- **VS Code Extension API**: Completion provider registration and rendering
- **Langium AST**: Parsed abstract syntax tree for determining completion context (inside action, inside loop, etc.)

## Out of Scope

- **CSS Selector Completion**: Deferred to future phase (depends on other features)
- **Cross-File Action Resolution**: Custom actions from imported files not included in this phase
- **Snippet Completions**: Template expansions (e.g., typing `for` expands to full loop template) deferred to Phase 3
- **Smart Relevance Ranking**: Context-aware sorting beyond alphabetical order deferred to Phase 3
- **Inline Documentation**: Hover tooltips for operations/parameters (separate feature)
- **Parameter Value Suggestions**: Auto-complete values for parameters (e.g., suggesting common CSS class names)
- **Fuzzy Matching**: Completion filtering uses prefix matching only (no fuzzy search)
- **Multi-File Action Index**: Completions for actions defined in other files
