# Feature Specification: Typed Labels Validation

**Feature Branch**: `034-typed-labels-the`
**Created**: 2025-11-17
**Status**: Draft
**Input**: User description: "typed labels validation for operation parameters marked with ParameterType:labelId"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Validate Label ID References in Operation Calls (Priority: P1)

A developer writes an Eligian timeline that references label IDs in operation calls (like `requestLabelData()` or `loadLottieAnimation()`), and the compiler validates that each referenced label ID exists in the imported labels JSON file, providing immediate feedback for typos or missing labels.

**Why this priority**: This is the core value of the feature - catching label ID errors at compile time rather than at runtime. Without this validation, developers won't discover missing or misspelled label IDs until they run the timeline, leading to runtime errors or blank content. This represents the minimum viable product (MVP).

**Independent Test**: Can be fully tested by creating an Eligian program with a `labels` import containing specific label IDs, then writing operation calls that reference both valid IDs (no errors) and invalid IDs (compilation errors with suggestions). Delivers immediate value by preventing runtime label errors.

**Acceptance Scenarios**:

1. **Given** an Eligian program with `labels './labels.json'` containing label ID "welcome-title", **When** an operation call uses `requestLabelData("welcome-title")`, **Then** no validation error is reported
2. **Given** an imported labels file with label IDs "welcome-title" and "button-text", **When** an operation call references "welcome-titel" (typo), **Then** a validation error is reported: "Unknown label ID: 'welcome-titel'"
3. **Given** an operation call with an unknown label ID "welcome-titel", **When** the validator checks available label IDs, **Then** the error message includes a suggestion: "Did you mean: 'welcome-title'?"
4. **Given** multiple label IDs imported from labels.json, **When** all operation calls use valid label IDs, **Then** compilation succeeds without label-related errors
5. **Given** an Eligian program with no labels import, **When** an operation call attempts to use a label ID parameter, **Then** a validation error indicates no labels are imported

---

### User Story 2 - Type-Safe Hover Information for Label IDs (Priority: P2)

A developer hovers over a label ID string in an operation call and sees hover information showing the label ID type, the number of translations available, and the supported language codes, helping them verify they're using the correct label.

**Why this priority**: Enhanced IDE support improves developer experience and productivity, but the feature works without it. This story builds on P1's validation by adding discoverability and documentation through hover tooltips.

**Independent Test**: Can be tested independently by hovering over label ID parameters in operation calls and verifying the tooltip displays: (1) type name "LabelID<welcome-title>", (2) number of translations, (3) language codes. Tests IDE integration without requiring full compilation.

**Acceptance Scenarios**:

1. **Given** a label ID "welcome-title" with 2 translations (en-US, nl-NL), **When** hovering over `requestLabelData("welcome-title")`, **Then** tooltip shows "LabelID<welcome-title>: 2 translations (en-US, nl-NL)"
2. **Given** a label ID with 5 translations, **When** hovering over the parameter, **Then** tooltip lists all 5 language codes
3. **Given** an operation call with an invalid label ID, **When** hovering over the invalid ID, **Then** tooltip shows an error indicator or unknown type
4. **Given** a label ID in an array parameter, **When** hovering over each array element, **Then** each shows its own label type information

---

### User Story 3 - Support Multiple Label ID Parameters (Priority: P3)

A developer uses operations that accept arrays of label IDs (like `loadLottieAnimation(labelIds: string[])` which has `@itemType=ParameterType:labelId`), and the compiler validates each element in the array to ensure all label IDs exist.

**Why this priority**: This handles edge cases where operations accept multiple label IDs. While important for completeness, it's less common than single label ID parameters. The core validation from P1 must work before handling array cases.

**Independent Test**: Can be tested independently by creating operation calls with array parameters containing multiple label IDs, verifying that each element is individually validated (both valid and invalid IDs produce correct diagnostics).

**Acceptance Scenarios**:

1. **Given** an operation with parameter `@itemType=ParameterType:labelId`, **When** the call uses an array `["label1", "label2"]`, **Then** each array element is validated as a label ID
2. **Given** an array parameter `["valid-id", "invalid-id", "another-valid-id"]`, **When** the validator checks the array, **Then** only "invalid-id" produces a validation error
3. **Given** an empty array parameter for a label ID array, **When** validation runs, **Then** no label ID errors are reported (empty array is valid)
4. **Given** a label ID array with 10 elements where 3 are invalid, **When** validation completes, **Then** all 3 invalid IDs are reported with individual error messages and suggestions

---

### Edge Cases

- What happens when the labels JSON file contains duplicate label IDs?
- How does the system handle label IDs with special characters or whitespace?
- What happens when a label ID is referenced before the labels import statement?
- How are label IDs validated when no labels file is imported (should all label ID parameters error)?
- What happens when the imported labels file is empty (empty array)?
- How does validation handle label IDs that are very similar to each other (e.g., "title1", "title2", "title3")?
- What happens when a single operation call mixes valid and invalid label IDs in an array?
- How are label IDs in nested object parameters handled?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create a Typir CustomKind type factory for label IDs (similar to ImportType)
- **FR-002**: Label ID type MUST be named "LabelID" with a type identifier format "LabelID<id>"
- **FR-003**: System MUST extract all label group IDs from imported labels JSON files and register them as available label IDs
- **FR-004**: System MUST infer LabelID type for operation parameters annotated with `ParameterType:labelId`
- **FR-005**: System MUST validate that string literals in label ID parameters match an imported label group ID
- **FR-006**: System MUST report validation errors when a label ID parameter references a non-existent label group ID
- **FR-007**: Validation error messages MUST include the invalid label ID and the operation parameter name
- **FR-008**: System MUST calculate Levenshtein distance to suggest similar label IDs when validation fails (threshold: distance ≤ 2)
- **FR-009**: Error messages MUST include "Did you mean: 'suggested-id'?" when a similar label ID exists
- **FR-010**: System MUST support array parameters with `@itemType=ParameterType:labelId` by validating each array element
- **FR-011**: System MUST provide hover information for label ID parameters showing: type name, translation count, language codes
- **FR-012**: Label ID type properties MUST include: label group ID, translation count, available language codes
- **FR-013**: System MUST maintain a registry of label IDs per document (similar to CSS registry pattern)
- **FR-014**: Label ID registry MUST update when the imported labels JSON file changes (hot-reload support)
- **FR-015**: System MUST validate label ID parameters only when a labels import exists in the program
- **FR-016**: System MUST report an error if label ID parameters are used without a labels import
- **FR-017**: Label ID type inference MUST integrate with existing Typir type system (no conflicts with other types)
- **FR-018**: System MUST handle label IDs in both single-value parameters and array parameters

### Key Entities

- **LabelID Type**: Represents a validated reference to a label group from the imported labels JSON
  - Attributes: `labelGroupId` (the label group ID string), `translationCount` (number of translations), `languageCodes` (array of supported language codes)
  - Relationships: References a Label Group from the imported labels JSON

- **Label ID Registry**: Tracks available label IDs for each Eligian document
  - Attributes: Document URI → Set of label group IDs
  - Relationships: Maps documents to their imported label IDs (similar to CSS Registry)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers receive immediate validation errors when referencing non-existent label IDs in operation calls
- **SC-002**: 100% of invalid label ID references are detected at compile time (before runtime)
- **SC-003**: Error messages for invalid label IDs include actionable suggestions when similar IDs exist (Levenshtein distance ≤ 2)
- **SC-004**: Hover tooltips display label ID type information including translation count and language codes
- **SC-005**: Validation works for both single label ID parameters and array parameters with label ID elements
- **SC-006**: Label ID validation updates within 500ms when the imported labels JSON file changes (hot-reload)
- **SC-007**: Programs without labels imports produce clear errors when attempting to use label ID parameters
- **SC-008**: Validation catches 100% of typos in label IDs that differ by 1-2 characters from valid IDs

## Assumptions

- **Typir Integration**: The project already uses Typir for type inference and validation (established in Feature 021)
- **Existing Patterns**: Implementation follows existing Typir type patterns (ImportType, TimelineEventType, TimelineType)
- **Registry Pattern**: Label ID registry follows the same pattern as CSS registry (centralized service, document-based tracking)
- **Levenshtein Algorithm**: The existing Levenshtein distance implementation from CSS validation can be reused for label ID suggestions
- **Parameter Metadata**: Eligius operation metadata already includes `ParameterType:labelId` annotations (confirmed in label-controller.ts and lottie-controller.ts)
- **JSON Schema**: Labels JSON file structure is validated by the schema from Feature 033 before label IDs are extracted
- **Hot-Reload**: The labels file watcher from Feature 033 (if implemented) can trigger label ID registry updates
- **Language Codes**: Language codes are stored as-is from the labels JSON (no validation of language code format)
- **Duplicate IDs**: If duplicate label group IDs exist in the JSON, the first occurrence is used (per Eligius runtime behavior)
- **String Literals Only**: Label ID validation applies only to string literal parameters (not dynamic strings or variables)
- **Error Priority**: Label ID validation runs after labels JSON schema validation (invalid JSON produces different errors)

## Dependencies

- **Feature 033**: Label Imports - This feature depends on the labels import syntax and JSON loading implemented in Feature 033
- **Typir Type System**: Requires existing Typir infrastructure from Feature 021 (Type System Phase 7)
- **CSS Validation**: Reuses Levenshtein distance utility from Feature 013 (CSS Class Validation)
- **Operation Metadata**: Depends on Eligius operation metadata containing `ParameterType:labelId` annotations
