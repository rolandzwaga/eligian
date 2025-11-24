# Feature Specification: Language Block Quick Fix

**Feature Branch**: `038-language-quick-fixes`
**Created**: 2025-11-24
**Status**: Draft
**Input**: User description: "language quick fixes. When a labels import is defined without a language block being present I want there to be a quick fix that generates the language block at the top of the file. If the label import file exists, it should parse the file and extract a unique list of referenced language codes and use that to populate the languages block with. For example, if nl-NL and en-US are used, it should output this block: languages { * \"nl-NL\" \"nl-NL label\" \"en-US\" \"en-US label\" }"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Language Block from Scratch (Priority: P1)

When a developer imports a labels file without defining a language block, the IDE should provide a quick fix that automatically generates the language block with all language codes found in the labels file.

**Why this priority**: This is the core MVP functionality - enabling developers to quickly create valid language configurations without manual typing, reducing errors and saving time.

**Independent Test**: Can be fully tested by creating an Eligian file with only a labels import, triggering the quick fix, and verifying the generated language block contains all language codes from the labels file with the first language marked as default.

**Acceptance Scenarios**:

1. **Given** an Eligian file with a labels import statement but no languages block, **When** the developer invokes the quick fix action, **Then** a languages block is inserted at the top of the file with all unique language codes extracted from the labels file
2. **Given** a labels file containing multiple language codes (e.g., nl-NL, en-US, fr-FR), **When** the quick fix generates the language block, **Then** all language codes appear in the block with the first one marked as default (*)
3. **Given** an Eligian file with syntax errors elsewhere, **When** the quick fix is triggered, **Then** only the language block is generated without affecting other parts of the file

---

### User Story 2 - Handle Missing or Invalid Labels Files (Priority: P2)

When the imported labels file does not exist or cannot be parsed, the IDE should still provide a quick fix that generates a basic language block template for the developer to fill in manually.

**Why this priority**: This handles error cases gracefully and ensures developers can still work productively even when the labels file is not yet available or has issues.

**Independent Test**: Can be tested by creating an Eligian file that imports a non-existent labels file, triggering the quick fix, and verifying a basic template language block is generated with placeholder language codes.

**Acceptance Scenarios**:

1. **Given** an Eligian file importing a labels file that does not exist, **When** the developer invokes the quick fix, **Then** a template language block is generated with placeholder language codes (e.g., "en-US" as default)
2. **Given** an Eligian file importing a labels file with invalid JSON syntax, **When** the quick fix is triggered, **Then** a template language block is generated (error is logged for debugging)
3. **Given** a labels file with no language codes, **When** the quick fix runs, **Then** a minimal language block template is created with a single default placeholder language

---

### User Story 3 - Smart Positioning and Formatting (Priority: P3)

The generated language block should be inserted at the appropriate location in the file (top of file, after imports or comments) with proper formatting that matches the project's code style.

**Why this priority**: This is a quality-of-life improvement that makes the generated code feel more natural and integrated, but the feature is functional without perfect positioning.

**Independent Test**: Can be tested by creating Eligian files with various structures (with/without comments, with/without other imports) and verifying the language block is always inserted in a logical, readable location.

**Acceptance Scenarios**:

1. **Given** an Eligian file with file-level comments at the top, **When** the language block is generated, **Then** it is inserted after the comments but before other content
2. **Given** an Eligian file with multiple import statements, **When** the language block is generated, **Then** it is inserted before all imports or at the top of the file
3. **Given** an Eligian file with existing content, **When** the language block is generated, **Then** proper spacing (blank lines) is added to separate it from surrounding code

---

### Edge Cases

- **Duplicate language codes**: System will deduplicate (covered by FR-008, tested in T010)
- **Extremely large files** (thousands of languages): System must handle gracefully without performance degradation up to 50 languages (covered by SC-003, tested in T062); files with >50 languages are out of scope for MVP
- **Existing incomplete language block**: Quick fix will NOT be available (system only detects completely missing blocks); updating existing blocks is out of scope for this feature
- **Invalid language code formats**: System will include as-is without validation (JSON schema validates label files; quick fix should not duplicate validation)
- **Relative vs absolute paths**: System will resolve both correctly (implementation detail in parser, tested implicitly in T019)
- **Multiple labels imports**: System will extract languages from ALL imports and combine them (covered by FR-003, tested in T012)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect when a labels import statement exists without a corresponding languages block
- **FR-002**: System MUST provide a code action (quick fix) option when this condition is detected
- **FR-003**: System MUST parse the imported labels file to extract all unique language codes
- **FR-004**: System MUST generate a languages block with all extracted language codes
- **FR-005**: System MUST mark the first language code (alphabetically) in the generated block as the default language (using * prefix)
- **FR-006**: System MUST insert the generated languages block at the top of the file (or after file-level comments)
- **FR-007**: System MUST format each language entry as: `"language-code" "language-code label"` (using the language code as both the code and the default label text)
- **FR-008**: System MUST deduplicate language codes if the labels file contains duplicates
- **FR-009**: System MUST handle cases where the labels file does not exist by generating a template language block with placeholder values
- **FR-010**: System MUST handle cases where the labels file cannot be parsed by generating a template language block (warnings are logged for debugging but not shown to user)
- **FR-011**: System MUST preserve existing file content and formatting when inserting the language block
- **FR-012**: Quick fix MUST be accessible via standard IDE mechanisms (light bulb icon, quick fix menu, keyboard shortcut)

### Key Entities *(include if feature involves data)*

- **Labels File**: A JSON file containing label definitions with language codes as keys or nested structures; referenced by the labels import statement
- **Language Code**: A string identifier for a language (e.g., "nl-NL", "en-US") following standard locale formatting (ISO 639-1 language code + ISO 3166-1 country code)
- **Languages Block**: A DSL construct at the top of an Eligian file that declares available languages, with one marked as default (syntax: `languages { }` with language entries inside)
- **Quick Fix**: An IDE code action that automatically corrects or improves code based on detected issues or missing elements

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can generate a complete language block from an imported labels file in under 5 seconds (from detecting the issue to applying the fix)
- **SC-002**: Generated language blocks contain 100% of the unique language codes present in the labels file with zero omissions
- **SC-003**: The quick fix successfully handles labels files with up to 50 different language codes without performance degradation
- **SC-004**: 95% of generated language blocks require no manual corrections by developers (correct formatting, positioning, and content) - *measured post-release via user feedback surveys*
- **SC-005**: The feature reduces the time to set up language configuration by 80% compared to manual typing - *measured post-release via user feedback and time studies*
- **SC-006**: Quick fix appears in the IDE within 1 second of opening a file with missing language block

## Assumptions

- Labels files follow a JSON format where language codes can be extracted (either as top-level keys or within a predictable nested structure)
- Language codes in labels files follow standard locale formatting (language-country format like "en-US")
- The first language code found in the labels file (or alphabetically first) is a reasonable choice for the default language
- Developers prefer having placeholder label text that matches the language code (e.g., "nl-NL label") over empty strings or generic text
- The language block should be positioned at the top of the file (or after comments) as this is the conventional location for configuration blocks
- When a labels file cannot be parsed, providing a template is more helpful than showing an error without a fix
- Standard IDE quick fix mechanisms (light bulb icon, Ctrl+. keyboard shortcut) are familiar to developers

## Dependencies

- Existing Eligian language parser must support the languages block syntax
- File system access to read the labels file referenced by the import statement
- JSON parser for reading and extracting language codes from labels files
- IDE language server protocol support for code actions/quick fixes
- Path resolution logic to locate labels files from import statements (relative/absolute paths)
