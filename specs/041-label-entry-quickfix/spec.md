# Feature Specification: Missing Label Entry Quick Fix

**Feature Branch**: `041-label-entry-quickfix`
**Created**: 2025-11-29
**Status**: Draft
**Input**: User description: "missing label quickfix. When hovering over a missing label id, and there IS a valid label import in the eligian file, we need to show a quickfix that will create a new entry in the label file with the specified label id and empty translation for all the languages that are defined in the eligian file."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Missing Label Entry with All Languages (Priority: P1)

A developer uses a label ID in their Eligian code that doesn't exist in the imported labels file. When they hover over the missing label ID, the IDE provides a quick fix that creates a new entry in the labels file with the specified ID and empty translations for all languages defined in the Eligian file's languages block.

**Why this priority**: This is the core functionality - the ability to create missing label entries with proper structure is the primary value proposition of this feature. Without this, developers must manually create label entries which is error-prone and time-consuming.

**Independent Test**: Can be fully tested by creating an Eligian file with a languages block defining 2+ languages, a valid labels import pointing to an existing file, and using a label ID that doesn't exist in that file. Trigger the quick fix and verify: (1) a new entry is added to the labels file with the correct structure, (2) the entry has the specified label ID, (3) the labels array contains one entry per language with empty label text.

**Acceptance Scenarios**:

1. **Given** an Eligian file with `languages { "en-US" "English" *"nl-NL" "Dutch" }` and a valid labels import, **When** I use a label ID `"welcomeMessage"` that doesn't exist in the labels file and invoke the quick fix, **Then** the labels file is updated with a new entry:
   ```json
   {
     "id": "welcomeMessage",
     "labels": [
       { "id": "<generated-uuid>", "languageCode": "en-US", "label": "" },
       { "id": "<generated-uuid>", "languageCode": "nl-NL", "label": "" }
     ]
   }
   ```
2. **Given** an Eligian file with 5 languages defined, **When** I invoke the quick fix for a missing label, **Then** the new entry contains exactly 5 translation entries (one per language) with unique UUIDs
3. **Given** the quick fix is invoked, **When** the labels file is updated, **Then** the file remains valid JSON and passes schema validation
4. **Given** the labels file already contains other entries, **When** the quick fix adds a new entry, **Then** existing entries are preserved and the new entry is appended to the array

---

### User Story 2 - Quick Fix Availability Conditions (Priority: P1)

The quick fix must only be available under specific conditions: a valid labels import exists, the label ID is used in a context that expects a label reference, and the label ID doesn't already exist in the labels file.

**Why this priority**: Without proper availability conditions, the quick fix could appear in inappropriate contexts or cause confusion, making it unreliable.

**Independent Test**: Can be tested by creating various scenarios (no labels import, invalid labels import, label ID already exists, label used outside of label context) and verifying the quick fix is only offered when all conditions are met.

**Acceptance Scenarios**:

1. **Given** an Eligian file WITHOUT a labels import, **When** I hover over a label ID usage, **Then** the "Create label entry" quick fix is NOT offered
2. **Given** an Eligian file with a labels import pointing to a non-existent file, **When** I hover over a label ID, **Then** the "Create label entry" quick fix is NOT offered (file must exist and be valid)
3. **Given** a label ID that ALREADY EXISTS in the labels file, **When** I hover over its usage, **Then** the "Create label entry" quick fix is NOT offered
4. **Given** all conditions are met (valid import, existing file, missing label), **When** I hover over the missing label ID, **Then** the quick fix "Create label entry 'labelId'" appears in the code actions menu

---

### User Story 3 - Handle Labels File Without Languages Block (Priority: P2)

When a developer uses a missing label ID but there's no languages block in the Eligian file, the system should fall back to a sensible default behavior.

**Why this priority**: This handles an edge case where developers may have labels files but haven't defined a languages block. While less common, it should still work gracefully.

**Independent Test**: Can be tested by creating an Eligian file with a labels import but no languages block, using a missing label ID, and verifying the quick fix behavior.

**Acceptance Scenarios**:

1. **Given** an Eligian file with a valid labels import but NO languages block, **When** I invoke the quick fix for a missing label, **Then** the new entry is created with a single translation using the default language code "en-US" and an empty label
2. **Given** no languages block exists, **When** the quick fix creates the entry, **Then** the entry structure still matches the schema with one translation entry

---

### Edge Cases

- **Labels file is read-only or locked**: The quick fix should report an error message that the file cannot be modified
- **Labels file contains invalid JSON**: The quick fix should NOT be offered when the labels file fails JSON parsing (invalid file cannot be safely modified)
- **Multiple usages of the same missing label**: The quick fix should appear for each usage, but after creating the entry once, subsequent quick fix invocations should no longer offer this action
- **Label ID contains special characters**: The label ID should be used exactly as typed by the developer (no escaping or modification)
- **Languages block has syntax errors**: If the languages block cannot be parsed, fall back to default language behavior
- **Very large labels file**: The quick fix should handle files with thousands of entries without significant delay
- **Concurrent modifications**: If the labels file is modified externally between hovering and invoking the quick fix, the file should be re-read to ensure accurate placement

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect when a label ID reference doesn't exist in the imported labels file
- **FR-002**: System MUST provide a code action (quick fix) offering to create the missing label entry when all conditions are met
- **FR-003**: System MUST only offer the quick fix when a valid labels import exists pointing to an existing, readable file
- **FR-004**: System MUST extract all language codes from the Eligian file's languages block to populate the new entry
- **FR-005**: System MUST create a new label entry with the structure matching the Eligius labels schema:
  ```json
  {
    "id": "<label-id>",
    "labels": [
      { "id": "<uuid>", "languageCode": "<code>", "label": "" }
    ]
  }
  ```
- **FR-006**: System MUST generate a unique UUID (v4) for each translation entry's `id` field
- **FR-007**: System MUST set the `label` field to an empty string for all translations (developer fills in later)
- **FR-008**: System MUST preserve the order of languages as defined in the languages block when creating translation entries
- **FR-009**: System MUST append the new entry to the existing labels array without modifying existing entries
- **FR-010**: System MUST ensure the modified labels file remains valid JSON
- **FR-011**: System MUST fall back to using "en-US" as the sole language when no languages block is defined
- **FR-012**: System MUST NOT offer the quick fix when the label ID already exists in the labels file
- **FR-013**: System MUST NOT offer the quick fix when the labels file contains invalid JSON
- **FR-014**: Quick fix MUST be accessible via standard IDE mechanisms (light bulb icon, quick fix menu, keyboard shortcut)
- **FR-015**: System MUST report clear error messages when file write fails (permissions, locked file, etc.)

### Key Entities

- **Label Reference**: A usage of a label ID in Eligian code that should resolve to an entry in the imported labels file
- **Labels File**: A JSON file containing an array of label entries matching the Eligius ILanguageLabel[] schema
- **Label Entry**: A JSON object with `id` (string) and `labels` (array of translations) properties
- **Translation Entry**: A JSON object with `id` (UUID), `languageCode` (string), and `label` (string) properties
- **Languages Block**: An optional DSL construct in the Eligian file that defines available languages with their codes and labels

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can create a missing label entry with all language translations in under 2 seconds from invoking the quick fix
- **SC-002**: The generated label entry passes schema validation 100% of the time
- **SC-003**: All languages from the languages block are included in the new entry (100% completeness)
- **SC-004**: Existing labels file entries are preserved 100% of the time when adding new entries
- **SC-005**: The quick fix is offered for all `unknown_label_id` diagnostics when the labels file exists and contains valid JSON
- **SC-006**: Error messages for write failures are clear and actionable (user can understand what went wrong)

## Assumptions

- The labels file validation and import infrastructure from Feature 033 is already implemented
- The languages block parsing from Feature 037 is already implemented
- Label ID references are already detectable through the existing validation system (missing label diagnostic exists)
- The labels file uses the standard Eligius labels schema as defined in `labels-schema.json`
- VS Code code actions API is available for providing quick fixes
- UUID generation is available via `crypto.randomUUID()`
- The file system allows writing to the labels file in the same directory structure

## Dependencies

- Feature 033 (Label Imports): Labels import syntax and file loading
- Feature 037 (Languages Syntax): Languages block parsing and language code extraction
- Existing label reference validation that detects missing label IDs
- Labels schema (`labels-schema.json`) for validation

## Out of Scope

- Creating the labels file itself (covered by Feature 039)
- Modifying existing label entries
- Renaming or moving label entries
- Pre-populating label text with suggestions or translations
- Batch creation of multiple missing labels at once
- Undo/redo support for label file modifications
