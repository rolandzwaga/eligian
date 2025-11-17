# Feature Specification: Label Imports

**Feature Branch**: `033-label-imports-a`
**Created**: 2025-11-17
**Status**: Draft
**Input**: User description: "label imports. A new type of import needs to be supported. This is the proposed syntax: labels '<path-to-labels-json-file>' So, an example would be: labels './labels.json' The content would be in this format: [{"id": "mainTitle", "labels": [{"id": "111", "languageCode": "en-US", "label": "test 1"}, {"id": "222", "languageCode": "nl-NL", "label": "tezt 1"}]}] This json should be loaded and assigned to the labels property of the IEngineConfiguration. As part of the validation, the json file should be validated using a json schema validator. I don't think a proper schema exists for it yet, so you will have to create that as well. This import, like the css and html imports is optional."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import Internationalization Labels (Priority: P1)

A developer creating a multi-language Eligius presentation needs to import label translations from a JSON file so that text content can be displayed in different languages based on user preferences.

**Why this priority**: This is the core functionality - without the ability to import labels, the feature has no value. It represents the minimum viable product (MVP) that enables internationalization support in Eligian programs.

**Independent Test**: Can be fully tested by writing an Eligian program with a `labels './labels.json'` statement, verifying the JSON file is loaded, and checking that the compiled Eligius configuration contains the label data in the `labels` property.

**Acceptance Scenarios**:

1. **Given** an Eligian program with `labels './labels.json'` statement, **When** the compiler processes the import, **Then** the compiler loads the JSON file from the specified path
2. **Given** a valid labels JSON file with multiple label groups and translations, **When** the file is loaded, **Then** the compiled configuration's `labels` property contains all label groups with their translations
3. **Given** an Eligian program without a `labels` import, **When** the compiler processes the program, **Then** the compiled configuration has an empty `labels` array (labels import is optional)
4. **Given** multiple label groups in the JSON file, **When** the file is loaded, **Then** each label group preserves its id and all language translations
5. **Given** label translations with different language codes, **When** the file is loaded, **Then** each translation maintains its id, languageCode, and label text

---

### User Story 2 - Validate Label JSON Structure (Priority: P2)

A developer imports a labels JSON file that contains syntax errors or invalid structure, and the compiler provides clear error messages indicating exactly what is wrong so they can fix the file.

**Why this priority**: Error handling is critical for developer experience but the feature can technically work without perfect validation. This story ensures developers get helpful feedback rather than cryptic failures.

**Independent Test**: Can be tested independently by creating various malformed labels JSON files (missing required fields, invalid types, syntax errors) and verifying that each produces a specific, actionable error message at compile time.

**Acceptance Scenarios**:

1. **Given** a labels JSON file with invalid syntax (unclosed brackets, trailing commas), **When** the compiler loads the file, **Then** an error is reported indicating the JSON syntax error with line/column information
2. **Given** a labels JSON file missing required `id` field in a label group, **When** the file is validated, **Then** an error is reported indicating which label group is missing the `id` field
3. **Given** a label translation missing required `languageCode` field, **When** the file is validated, **Then** an error is reported indicating which translation is missing the field
4. **Given** a labels JSON file that is not an array, **When** the file is validated, **Then** an error is reported indicating the root must be an array
5. **Given** multiple validation errors in a labels JSON file, **When** the file is validated, **Then** all errors are reported together (not just the first one)

---

### User Story 3 - Handle Missing or Inaccessible Label Files (Priority: P3)

A developer specifies a labels file path that doesn't exist or cannot be read, and the compiler provides a clear error message indicating the file cannot be found or accessed.

**Why this priority**: This is important for robustness but represents error handling for less common scenarios (file not found is developer error). It can be added after core functionality works.

**Independent Test**: Can be tested independently by creating Eligian programs that reference non-existent files, files with incorrect paths, or files without read permissions, and verifying each produces an appropriate error message.

**Acceptance Scenarios**:

1. **Given** a labels import with a file path that doesn't exist, **When** the compiler attempts to load the file, **Then** an error is reported indicating the file cannot be found with the specified path
2. **Given** a labels import with an absolute file path (not relative), **When** the compiler validates the import, **Then** an error is reported indicating only relative paths are allowed
3. **Given** a labels file that exists but cannot be read (permissions), **When** the compiler attempts to load the file, **Then** an error is reported indicating a read permission error
4. **Given** multiple labels imports in the same program, **When** the compiler validates the program, **Then** an error is reported indicating only one labels import is allowed

---

### Edge Cases

- What happens when a labels JSON file is empty (empty array)?
- How does the system handle label groups with no translations (empty `labels` array)?
- What happens when two label groups have the same `id`?
- How does the system handle duplicate `languageCode` values within the same label group?
- What happens when a label translation's `id` field contains special characters or whitespace?
- How are very large labels JSON files (thousands of label groups) handled?
- What happens when the labels file contains additional fields not in the schema?
- How are non-UTF-8 characters in label text handled?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a `labels` import statement with syntax `labels '<path-to-json-file>'`
- **FR-002**: System MUST allow only relative file paths in labels import statements (not absolute paths)
- **FR-003**: System MUST load the labels JSON file from the specified path relative to the Eligian source file
- **FR-004**: System MUST validate the loaded JSON against a defined schema before compilation
- **FR-005**: System MUST assign the validated labels data to the `labels` property of the compiled Eligius configuration
- **FR-006**: Labels import MUST be optional (programs without labels import should compile successfully)
- **FR-007**: System MUST allow at most one labels import per Eligian program
- **FR-008**: System MUST create a JSON schema that validates the labels file structure (array of label groups)
- **FR-009**: JSON schema MUST require each label group to have an `id` field (string type)
- **FR-010**: JSON schema MUST require each label group to have a `labels` field (array of label translations)
- **FR-011**: JSON schema MUST require each label translation to have `id`, `languageCode`, and `label` fields (all string types)
- **FR-012**: System MUST report validation errors when labels JSON does not conform to the schema
- **FR-013**: System MUST report errors when the labels file cannot be found or read
- **FR-014**: System MUST report errors when the labels JSON contains syntax errors
- **FR-015**: Validation errors MUST include the file path, error type, and location information when available
- **FR-016**: System MUST handle labels files with non-ASCII characters in label text (UTF-8 support)

### Key Entities

- **Label Group**: Represents a collection of translations for a single label identifier
  - Attributes: `id` (unique identifier for the label group), `labels` (array of translations)
  - Relationships: Contains multiple Label Translations

- **Label Translation**: Represents a single language translation of a label
  - Attributes: `id` (translation identifier), `languageCode` (language code like "en-US", "nl-NL"), `label` (translated text)
  - Relationships: Belongs to a Label Group

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can import label translations by adding a single `labels './file.json'` statement to their Eligian program
- **SC-002**: Compiled Eligius configurations contain all label data from imported JSON files without data loss or corruption
- **SC-003**: Validation errors for malformed labels JSON files are reported with actionable error messages
- **SC-004**: Labels import validation catches 100% of schema violations (missing required fields, incorrect types)
- **SC-005**: Error messages for missing files or invalid paths are clear and include the attempted file path
- **SC-006**: Programs without labels imports compile successfully without warnings or errors related to labels

## Assumptions

- **File Format**: Labels are stored in standard JSON format (not JSON5, JSONC, or other variants)
- **Language Codes**: Language codes follow standard formats (e.g., "en-US", "nl-NL") but the schema does not enforce specific formats - any string is accepted
- **File Encoding**: Labels JSON files are UTF-8 encoded
- **File Size**: Most labels files will be under 100KB; system should handle up to 1MB comfortably
- **Path Resolution**: File paths are resolved relative to the Eligian source file's directory (same as CSS and HTML imports)
- **Schema Location**: JSON schema will be stored in the project's schema directory alongside other validation schemas
- **Duplicate Handling**: Duplicate label group IDs or duplicate language codes within a group are allowed by the schema (runtime behavior is Eligius library's responsibility)
- **Additional Properties**: JSON schema allows additional properties beyond the required fields (for forward compatibility)
- **Validation Library**: Standard JSON schema validation library will be used (e.g., Ajv for TypeScript/Node.js)
