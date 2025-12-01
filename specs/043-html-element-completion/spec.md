# Feature Specification: HTML Element Completion for createElement

**Feature Branch**: `043-html-element-completion`
**Created**: 2025-12-01
**Status**: Draft
**Input**: User description: "Add code completion for createElement operation with HTML element names from HTMLElementTagNameMap and context-aware attribute completions based on the selected element type"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HTML Element Name Completion (Priority: P1)

As a developer writing Eligian DSL code, when I use the `createElement` operation and need to specify an element name, I want to see a list of valid HTML element names so that I can quickly select the correct element without memorizing all HTML tags or making typos.

**Why this priority**: This is the foundational feature. Without element name completion, developers must type element names manually, leading to typos and invalid elements. This provides immediate value with minimal complexity.

**Independent Test**: Can be fully tested by typing `createElement("|")` and verifying that a completion list appears with valid HTML element names like "div", "span", "button", etc.

**Acceptance Scenarios**:

1. **Given** the cursor is inside the first parameter of a `createElement` operation (e.g., `createElement("|")`), **When** completion is triggered, **Then** a list of all valid HTML element names appears sorted alphabetically
2. **Given** the cursor is inside the first parameter with partial text (e.g., `createElement("bu|")`), **When** completion is triggered, **Then** the list is filtered to show only matching elements (e.g., "button")
3. **Given** the user selects an element from the completion list, **When** they confirm the selection, **Then** the element name is inserted correctly within the quotes

---

### User Story 2 - Element-Specific Attribute Completion (Priority: P2)

As a developer writing Eligian DSL code, when I specify the attributes parameter for `createElement`, I want to see completion suggestions for attributes that are valid for the specific HTML element I'm creating, so that I only use attributes that make sense for that element.

**Why this priority**: This builds on US1 by providing context-aware attribute suggestions. It significantly improves developer experience by preventing invalid attribute usage and speeding up development.

**Independent Test**: Can be tested by typing `createElement("img", { | })` and verifying that image-specific attributes like "src", "alt", "width", "height" appear in completions.

**Acceptance Scenarios**:

1. **Given** `createElement("a", { | })` with cursor inside the attributes object, **When** completion is triggered, **Then** anchor-specific attributes appear (href, target, download, rel, etc.)
2. **Given** `createElement("img", { | })` with cursor inside the attributes object, **When** completion is triggered, **Then** image-specific attributes appear (src, alt, width, height, loading, etc.)
3. **Given** `createElement("input", { | })` with cursor inside the attributes object, **When** completion is triggered, **Then** input-specific attributes appear (type, value, placeholder, checked, disabled, etc.)
4. **Given** partial attribute text (e.g., `createElement("a", { hr| })`), **When** completion is triggered, **Then** the list is filtered to matching attributes (e.g., "href", "hreflang")

---

### User Story 3 - Attribute Value Completion for Enumerated Types (Priority: P3)

As a developer writing Eligian DSL code, when I'm setting an attribute that has a defined set of valid values (like `type` on an input element), I want to see completion suggestions for those valid values so that I use only valid values and discover available options.

**Why this priority**: This is an enhancement that provides additional convenience for attributes with constrained value sets. It builds on US2 and is valuable but not essential for basic functionality.

**Independent Test**: Can be tested by typing `createElement("input", { type: "|" })` and verifying that valid input types like "text", "password", "checkbox", "radio", "email" appear.

**Acceptance Scenarios**:

1. **Given** `createElement("input", { type: "|" })` with cursor inside the type value, **When** completion is triggered, **Then** valid input types appear (text, password, checkbox, radio, email, number, date, etc.)
2. **Given** `createElement("a", { target: "|" })` with cursor inside the target value, **When** completion is triggered, **Then** valid target values appear (_self, _blank, _parent, _top)
3. **Given** `createElement("img", { loading: "|" })` with cursor inside the loading value, **When** completion is triggered, **Then** valid loading values appear (eager, lazy)
4. **Given** partial value text (e.g., `createElement("input", { type: "che|" })`), **When** completion is triggered, **Then** the list is filtered to matching values (e.g., "checkbox")

---

### Edge Cases

- What happens when the element name is invalid or not yet typed? The attributes completion should not appear or should show generic HTML element attributes.
- What happens when the element name contains a typo? The system should handle gracefully and not crash; attribute completions may not appear until a valid element is specified.
- What happens with custom elements (e.g., `createElement("my-component", ...)`)? The system should provide generic HTMLElement attributes as a fallback.
- What happens when cursor is between createElement parameters but outside quotes/braces? No completion should appear for element names or attributes in invalid positions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide completion for all 112 standard HTML element names from the HTMLElementTagNameMap type when cursor is in the elementName parameter of createElement
- **FR-002**: System MUST filter element name completions based on the text already typed by the user
- **FR-003**: System MUST provide element-specific attribute completions based on the element name specified in the first parameter of createElement
- **FR-004**: System MUST include both element-specific attributes and inherited HTMLElement attributes in attribute completions
- **FR-005**: System MUST provide value completions for attributes that have enumerated/constrained value types (e.g., input type, target, loading)
- **FR-006**: System MUST filter attribute and value completions based on partial text typed by the user
- **FR-007**: System MUST handle invalid or missing element names gracefully without errors
- **FR-008**: System MUST generate attribute metadata from TypeScript's DOM type definitions to ensure accuracy and completeness
- **FR-009**: System MUST display appropriate detail text for each completion item (e.g., "HTML element", "HTML attribute", attribute type)
- **FR-010**: System MUST sort completions alphabetically for discoverability

### Key Entities

- **HTML Element Metadata**: Element name, associated interface name (e.g., HTMLAnchorElement), and list of element-specific attributes
- **Attribute Metadata**: Attribute name, type information (string, number, boolean, or enumerated values), whether required, and brief description
- **Completion Context**: Current cursor position, surrounding text, detected operation name, and parameter position

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can discover and select HTML element names in under 3 seconds using completion
- **SC-002**: 100% of standard HTML elements (112 elements) are available in completion suggestions
- **SC-003**: Element-specific attributes are correctly suggested for at least the 20 most commonly used HTML elements (div, span, a, img, input, button, form, table, ul, ol, li, p, h1-h6, label, select, textarea, video, audio, canvas)
- **SC-004**: Completion response time is under 100ms for all completion scenarios
- **SC-005**: Zero crashes or errors when completion is triggered in any valid or invalid context
- **SC-006**: Attribute value completions are available for at least 10 commonly enumerated attributes (input type, target, loading, autocomplete, rel, method, enctype, crossorigin, preload, wrap)
