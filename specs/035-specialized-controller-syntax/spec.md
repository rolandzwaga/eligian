# Feature Specification: Specialized Controller Syntax

**Feature Branch**: `035-specialized-controller-syntax`
**Created**: 2025-11-17
**Status**: Draft
**Input**: User description: "specialized controller syntax. Currently, this is how you add a controller to an element:
{
          \"systemName\": \"getControllerInstance\",
          \"operationData\": {
            \"systemName\": \"LabelController\"
          }
        },
        {
          \"systemName\": \"addControllerToElement\",
          \"operationData\": {
            \"labelId\": \"mainTitle\"
          }
        }
I'd like to shortcircuit this with some specialized Eligian syntax like this:
addController('LabelController', \"mainTitle\")
Where the second argument gets inferred from the controller name. So, the addController action can have more than two arguments, depending on the first argument.
The controller metadata can be retrieved from the eligius library by importing the ctrlmetadata structure, which works similar to the metadata and eventmetadata which is already being processed in the language package, so you can glean from there how to do that.
The arguments should of course be validated using this metadata, this is also the first example where we can validate the labelId type.
Is this clear, or do you have any questions for clarification?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Universal Controller Addition Syntax (Priority: P1)

As a developer writing Eligian programs, I want to add ANY controller to elements using concise `addController` syntax with automatic parameter validation based on controller metadata, so that I can write cleaner code and catch configuration errors during development rather than runtime.

**Why this priority**: This is the core MVP - replacing verbose multi-operation sequences with a single, validated operation for ALL Eligius controllers. Delivers immediate developer productivity gains and error prevention across the entire controller API surface.

**Independent Test**: Can be fully tested by writing `addController` statements for multiple controller types (LabelController, NavigationController, SubtitlesController, etc.) and verifying: (1) each compiles to correct Eligius JSON, (2) parameter count validation works, (3) unknown controller names are rejected.

**Acceptance Scenarios**:

1. **Given** an Eligian program, **When** developer writes `addController('LabelController', "mainTitle")`, **Then** the code compiles to `getControllerInstance` + `addControllerToElement` operations with correct parameters
2. **Given** an Eligian program, **When** developer writes `addController('NavigationController', param1, param2)` with correct parameters for NavigationController, **Then** the code compiles successfully
3. **Given** an Eligian program, **When** developer writes `addController('UnknownController', "someParam")`, **Then** a compile-time error appears indicating the controller type is not recognized
4. **Given** an Eligian program, **When** developer writes `addController('LabelController')` missing required parameters, **Then** a compile-time error indicates missing required parameters
5. **Given** an Eligian program, **When** developer writes `addController('LabelController', param1, param2, param3)` with too many parameters, **Then** a compile-time error indicates too many parameters provided

---

### User Story 2 - Label ID Type Validation (Priority: P2)

As a developer using LabelController, I want label ID parameters to be validated against imported label files with typo suggestions, so that I catch label reference errors at compile time instead of runtime.

**Why this priority**: This enhances the P1 functionality with specialized type validation for the labelId parameter type. It leverages Feature 034 infrastructure and is the first practical use case for type-specific parameter validation. Can be implemented after basic parameter validation works.

**Independent Test**: Can be fully tested by writing `addController('LabelController', "labelId")` statements with valid/invalid/typo label IDs and verifying compile-time diagnostics appear with Levenshtein suggestions.

**Acceptance Scenarios**:

1. **Given** an Eligian program with labels imported from `labels.json`, **When** developer writes `addController('LabelController', "mainTitle")` where "mainTitle" exists in the labels file, **Then** the code compiles successfully without validation errors
2. **Given** an Eligian program with labels imported, **When** developer writes `addController('LabelController', "unknownLabel")` where "unknownLabel" does not exist, **Then** a compile-time error appears with message "Unknown label ID: 'unknownLabel'"
3. **Given** an Eligian program, **When** developer writes `addController('LabelController', "typoLabel")` where "typoLabel" is within edit distance 2 of "testLabel", **Then** the error includes suggestion "Did you mean: 'testLabel'?"
4. **Given** an Eligian program without label imports, **When** developer writes `addController('LabelController', "anyLabel")`, **Then** a compile-time warning or error indicates no labels are imported for validation

---

### User Story 3 - IDE Support with Autocomplete and Hover Documentation (Priority: P3)

As a developer using the VS Code extension, I want IDE support for `addController` including autocomplete for controller names and parameter hints, so that I can discover available controllers and understand their parameters without consulting external documentation.

**Why this priority**: Enhances developer experience but is not essential for basic functionality. The code still works without IDE hints, so this can be added after core validation is working.

**Independent Test**: Can be fully tested in VS Code by triggering autocomplete after typing `addController(` and verifying: (1) controller names appear in suggestions, (2) selecting a controller shows parameter hints, (3) hovering over parameters shows documentation from controller metadata.

**Acceptance Scenarios**:

1. **Given** developer types `addController('` in VS Code, **When** autocomplete is triggered, **Then** available controller names appear in the suggestion list
2. **Given** developer hovers over the controller name string literal in `addController('LabelController', ...)`, **When** hover is triggered, **Then** documentation about LabelController appears including parameter requirements
3. **Given** developer is at the second parameter position in `addController('LabelController', ...)`, **When** autocomplete is triggered, **Then** available label IDs appear in the suggestion list
4. **Given** developer hovers over a label ID parameter, **When** hover is triggered, **Then** label metadata appears (translation count, language codes)

---

### Edge Cases

- What happens when controller metadata is not available (Eligius library not imported)?
- How does the system handle controllers that accept optional parameters versus required parameters?
- What happens when a controller name is provided as a variable/constant instead of a string literal?
- How does validation work when label files are updated while editing?
- What happens when multiple controllers are added to the same element in sequence?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide `addController` syntax that accepts a controller name as the first parameter
- **FR-002**: System MUST infer required parameter types from controller metadata based on the controller name
- **FR-003**: System MUST validate label ID parameters against imported label files when controller type is LabelController
- **FR-004**: System MUST load controller metadata from the Eligius library ctrlmetadata structure
- **FR-005**: System MUST compile `addController` statements to the equivalent `getControllerInstance` + `addControllerToElement` operation sequence in Eligius JSON
- **FR-006**: System MUST provide compile-time validation errors when controller names are unrecognized
- **FR-007**: System MUST provide compile-time validation errors when required parameters are missing
- **FR-008**: System MUST provide compile-time validation errors when too many parameters are provided
- **FR-009**: System MUST provide compile-time validation errors when parameter types do not match controller metadata expectations
- **FR-010**: System MUST support Levenshtein distance-based suggestions for typos in label IDs (threshold ≤2)
- **FR-011**: System MUST support variable numbers of parameters per controller type based on metadata
- **FR-012**: System MUST preserve existing operation-based controller addition syntax for backwards compatibility

### Key Entities

- **Controller Metadata**: Information about available controller types including their system names, required parameters, parameter types, and parameter documentation (sourced from Eligius ctrlmetadata)
- **Label ID Type**: A specialized parameter type representing a reference to a label group defined in imported label files, requiring validation against available label IDs
- **Controller Name**: The first parameter to `addController`, a string literal identifying which controller type to instantiate
- **Controller Parameters**: Subsequent parameters to `addController`, varying in number and type based on the controller name, validated against controller metadata

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can add controllers using single-line syntax instead of multi-operation sequences (2+ operations reduced to 1)
- **SC-002**: Label ID validation catches 100% of invalid label references at compile time when label ID is a string literal
- **SC-003**: Controller parameter count mismatches are detected at compile time with clear error messages
- **SC-004**: Typo suggestions are provided for label IDs within edit distance 2 of valid labels
- **SC-005**: Code completion provides controller name suggestions in under 300ms
- **SC-006**: All existing Eligian programs using operation-based controller syntax continue to compile without changes
- **SC-007**: Developers receive parameter type errors at compile time for 100% of statically determinable type mismatches (when arguments are literals or typed expressions)

## Assumptions

- **AS-001**: Controller metadata structure in Eligius library (ctrlmetadata) follows same pattern as existing metadata and eventmetadata structures already processed by the language package
- **AS-002**: Controller names are provided as string literals (not variables) to enable compile-time validation
- **AS-003**: All Eligius controllers defined in ctrlmetadata must be supported from MVP (no phased controller rollout)
- **AS-004**: The existing label registry infrastructure (from Feature 034) is available and functional for labelId type validation
- **AS-005**: Controller metadata includes sufficient information to determine parameter types and validation rules
- **AS-006**: The transformation to `getControllerInstance` + `addControllerToElement` operations produces semantically equivalent Eligius JSON to manually written sequences

## Dependencies

- **Feature 034 - Typed Labels Validation**: Required for label ID validation infrastructure (LabelRegistryService, validateLabelID, Levenshtein distance suggestions)
- **Eligius Library ctrlmetadata**: Required for controller metadata definitions and parameter specifications
- **Existing metadata processing**: Pattern from metadata and eventmetadata processing will be reused for ctrlmetadata

## Scope

### In Scope

- `addController` syntax for all controller types defined in Eligius ctrlmetadata
- Label ID parameter validation for LabelController
- Parameter count and type validation based on controller metadata
- Compile-time error reporting with suggestions
- IDE autocomplete and hover support for controller names and parameters
- Transformation to equivalent Eligius JSON operation sequences
- Backwards compatibility with operation-based controller syntax

### Out of Scope

- Runtime controller validation (only compile-time)
- Custom/user-defined controller types (only Eligius built-in controllers)
- Dynamic controller name resolution (controller name must be string literal)
- Controller lifecycle management beyond instantiation and attachment
- Multiple controller parameters of the same name (each controller has unique parameter set)
