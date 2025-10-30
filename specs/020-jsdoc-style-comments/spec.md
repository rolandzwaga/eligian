# Feature Specification: JSDoc-Style Documentation Comments for Custom Actions

**Feature Branch**: `020-jsdoc-style-comments`
**Created**: 2025-10-30
**Status**: Draft
**Input**: User description: "JSDoc style comments. I want to add JSDoc style comments for custom actions that can contain a description of the action and one for each parameter. I want to largely copy the way JSDoc works, but obviously we don't need ALL of the features. We just need the main description and the @param tag support. I also want the automatic generation of the comment like in Javascript and Typescript, where when you type /**, once you enter the second asterisk the rest of the comment is generated for you. So, for example if we have this action: endable action foo(bar: string, baz) when the comment is auto generated, it would look like this: /** * * @param {string} bar * @param {number} baz */ endable action foo(bar: string, baz) The second @param type would be inferred from the custom action, this functionality already exists in the code base. Once this comment is present on a custom action, the contents should be visible in a hover message when hovering over the invocation of an action."

## User Scenarios & Testing

### User Story 1 - Write Action Documentation (Priority: P1)

Developers can write structured documentation comments above custom action definitions to describe what the action does and what each parameter means. This documentation uses a familiar JSDoc-style syntax with `/** */` delimiters and `@param` tags.

**Why this priority**: This is the foundation - without the ability to write and parse documentation comments, no other documentation features can work. It delivers immediate value by allowing developers to document their custom actions.

**Independent Test**: Can be fully tested by writing documentation comments above action definitions and verifying they are recognized by the language parser without errors.

**Acceptance Scenarios**:

1. **Given** an Eligian file with a custom action, **When** developer writes `/** Description */` above the action, **Then** the comment is recognized as documentation
2. **Given** a documented action with parameters, **When** developer adds `@param` tags for each parameter, **Then** each parameter's documentation is parsed correctly
3. **Given** a documented action, **When** developer includes type information in `@param {type} name` format, **Then** the type annotation is recognized
4. **Given** a documented action, **When** developer includes description text after `@param` tag, **Then** the parameter description is captured
5. **Given** an undocumented action, **When** developer invokes it elsewhere, **Then** no documentation appears (baseline behavior)

---

### User Story 2 - Auto-Generate Documentation Templates (Priority: P2)

When developers type `/**` above an action definition and press Enter (or complete the second `*`), the editor automatically generates a documentation template with placeholders for the description and a `@param` tag for each parameter, with types pre-filled based on existing type inference.

**Why this priority**: Dramatically improves developer productivity by removing the manual work of writing boilerplate documentation structure. Makes documentation more consistent and encourages developers to document their code.

**Independent Test**: Can be fully tested by typing `/**` above various action definitions and verifying the generated template matches the action signature, without needing hover functionality.

**Acceptance Scenarios**:

1. **Given** cursor positioned on line above an action definition, **When** developer types `/**` and completes it, **Then** a documentation template is generated with blank description line and `@param` entries for each parameter
2. **Given** an action with typed parameters (e.g., `foo(bar: string)`), **When** template is generated, **Then** parameter types are pre-filled in the `@param {string} bar` format
3. **Given** an action with untyped parameters, **When** template is generated, **Then** parameter types are inferred from usage and pre-filled (leveraging existing type inference)
4. **Given** an action with no parameters, **When** template is generated, **Then** only the description placeholder is created (no `@param` tags)
5. **Given** a generated template, **When** developer fills in description and parameter details, **Then** the documentation is properly formatted and valid

---

### User Story 3 - View Documentation on Hover (Priority: P3)

When developers hover over an action invocation (call site), they see a formatted tooltip displaying the action's documentation, including the description and parameter information from the JSDoc comment above the action definition.

**Why this priority**: Completes the documentation workflow by making the documented information accessible at call sites. This delivers the key value proposition - developers can understand what an action does without navigating to its definition.

**Independent Test**: Can be fully tested by hovering over documented action invocations and verifying the tooltip shows the documentation from the action's definition, including description and parameter details.

**Acceptance Scenarios**:

1. **Given** an action with JSDoc documentation, **When** developer hovers over an invocation of that action, **Then** a tooltip displays the action's description
2. **Given** a documented action with `@param` tags, **When** hovering over the invocation, **Then** the tooltip includes parameter names, types, and descriptions in a readable format
3. **Given** an undocumented action, **When** hovering over the invocation, **Then** a basic tooltip shows the action signature without documentation (baseline behavior)
4. **Given** a partially documented action (description but no param docs), **When** hovering over the invocation, **Then** the tooltip shows the available documentation
5. **Given** documentation with markdown formatting in description, **When** hovering over the invocation, **Then** the tooltip renders basic markdown (bold, italic, code spans)

---

### Edge Cases

- What happens when JSDoc comment has `@param` tags that don't match actual parameters (extra tags, missing tags, wrong names)?
- How does the system handle malformed JSDoc comments (unclosed comments, invalid tag syntax)?
- What if developer manually types a JSDoc template instead of using auto-generation - should it still work?
- How does auto-generation handle actions with very long parameter lists (10+ parameters)?
- What if an action's signature changes after documentation is written - does the documentation become stale?
- How are special characters in descriptions handled (e.g., `*/`, `@`, curly braces)?
- What happens when hovering over action invocations before the documentation comment is fully written?
- How does the system handle nested documentation comments or documentation for nested actions?

## Requirements

### Functional Requirements

- **FR-001**: System MUST recognize JSDoc-style comments (`/** ... */`) placed directly above action definitions as documentation comments
- **FR-002**: System MUST parse the main description text (lines between `/**` and first `@tag` or closing `*/`)
- **FR-003**: System MUST parse `@param` tags in the format `@param {type} name description`
- **FR-004**: System MUST support optional type annotations in `@param` tags (e.g., `@param {string}`, `@param {number}`)
- **FR-005**: System MUST support optional descriptions for `@param` tags (text following the parameter name)
- **FR-006**: System MUST allow `@param` tags with just name (e.g., `@param foo`) when type and description are omitted
- **FR-007**: System MUST preserve whitespace and line breaks within documentation descriptions
- **FR-008**: System MUST trigger documentation template generation when user types `/**` followed by Enter or second `*` on the line above an action
- **FR-009**: System MUST infer parameter types using existing type inference system when generating templates for untyped parameters
- **FR-010**: System MUST generate `@param` placeholders in the correct order matching the action's parameter list
- **FR-011**: System MUST include a blank line for description entry in generated templates
- **FR-012**: System MUST display documentation in hover tooltips when user hovers over action invocations
- **FR-013**: System MUST format hover tooltip with description followed by parameter details
- **FR-014**: System MUST show parameter name, type, and description (if available) in hover tooltip
- **FR-015**: System MUST support basic markdown rendering in hover tooltips (bold, italic, code spans, links)
- **FR-016**: System MUST handle missing or partial documentation gracefully (show what's available without errors)
- **FR-017**: System MUST associate documentation comments with the immediately following action definition
- **FR-018**: System MUST ignore non-documentation block comments (e.g., `/* */` without extra asterisk)

### Key Entities

- **Documentation Comment**: A JSDoc-style block comment (`/** ... */`) containing:
  - Main description text (optional, but recommended)
  - Zero or more `@param` tags (one per action parameter)
  - Position: directly above the action definition it documents

- **@param Tag**: A documentation element within a JSDoc comment consisting of:
  - Tag identifier: `@param`
  - Type annotation (optional): `{type}` (e.g., `{string}`, `{number}`, `{boolean}`)
  - Parameter name (required): matches a parameter in the action signature
  - Description text (optional): explains the parameter's purpose
  - Format: `@param {type} name description text`

- **Action Definition**: A custom or endable action declaration with:
  - Action name
  - Parameter list (may include type annotations)
  - Associated documentation comment (optional, positioned immediately above)

- **Action Invocation**: A call site where an action is used, which:
  - References the action by name
  - May display documentation in hover tooltip
  - Links back to the action's documentation comment

## Success Criteria

### Measurable Outcomes

- **SC-001**: Developers can write a JSDoc documentation comment above any action definition and see it recognized by the editor without syntax errors
- **SC-002**: When typing `/**` above an action, a complete documentation template appears within 500ms of completing the trigger sequence
- **SC-003**: Auto-generated templates correctly include all parameters from the action signature with 100% accuracy
- **SC-004**: Parameter types in auto-generated templates match the existing type inference system's output with 100% accuracy
- **SC-005**: Hovering over an action invocation displays its documentation within 300ms
- **SC-006**: Documentation hover tooltips correctly display all documented information (description and all `@param` details) without formatting errors
- **SC-007**: The feature supports actions with up to 20 parameters without performance degradation or UI issues
- **SC-008**: Malformed documentation comments do not cause parser errors or editor crashes - they are ignored or partially parsed gracefully
- **SC-009**: 90% of developers successfully document an action on their first attempt using auto-generation
- **SC-010**: Documentation workflow (type `/**`, fill template, view on hover) completes in under 30 seconds for typical action with 3-5 parameters
