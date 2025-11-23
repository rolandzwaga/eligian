# Feature Specification: Languages Declaration Syntax

**Feature Branch**: `037-languages-syntax`
**Created**: 2025-11-23
**Status**: Draft
**Input**: User description: "Add languages syntax to define available languages and default language. Must be first declaration. Single language = implicit default. Multiple languages = require * marker for default. Integrate with Typir type system."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single Language Declaration (Priority: P1)

A developer creating a monolingual Eligian presentation wants to declare the presentation language without specifying available languages or marking a default.

**Why this priority**: This is the most common use case - most presentations start as single-language projects. It should be the simplest syntax with no ceremony.

**Independent Test**: Can be fully tested by writing a languages block with one language, compiling, and verifying the generated Eligius configuration contains the correct `language` and `availableLanguages` properties.

**Acceptance Scenarios**:

1. **Given** an empty Eligian file, **When** I write `languages { "en-US" "English" }` as the first declaration, **Then** the compiler generates `language: "en-US"` and `availableLanguages: [{ id: "<uuid>", languageCode: "en-US", label: "English" }]` (where `<uuid>` is a generated UUID v4)
2. **Given** a single language declaration, **When** I compile the file, **Then** no default marker (`*`) is required

---

### User Story 2 - Multiple Languages with Explicit Default (Priority: P2)

A developer creating a multilingual presentation wants to declare all available languages and specify which one is the default language for initial load.

**Why this priority**: Essential for internationalized presentations but less common than single-language projects. Builds on P1 foundation.

**Independent Test**: Can be tested independently by writing a languages block with multiple languages (one marked with `*`), compiling, and verifying the correct default language is set in the configuration.

**Acceptance Scenarios**:

1. **Given** an Eligian file, **When** I write a languages block with 3 languages and mark one with `*`, **Then** the compiler sets `language` to the marked language and includes all 3 in `availableLanguages`
2. **Given** a languages block with multiple languages, **When** no language is marked with `*`, **Then** the compiler reports a validation error
3. **Given** a languages block with multiple languages, **When** more than one language is marked with `*`, **Then** the compiler reports a validation error

---

### User Story 3 - First Declaration Enforcement (Priority: P1)

A developer wants clear, predictable structure in Eligian files by having the languages declaration always appear first (when present).

**Why this priority**: Critical for consistency and tooling support. The language setting affects how labels and content are interpreted throughout the file.

**Independent Test**: Can be tested by attempting to place the languages block after other declarations (imports, actions, timelines) and verifying the compiler reports a validation error.

**Acceptance Scenarios**:

1. **Given** an Eligian file, **When** the languages block appears before all other declarations, **Then** the file compiles successfully
2. **Given** an Eligian file, **When** the languages block appears after a layout import, **Then** the compiler reports: "languages block must be the first declaration"
3. **Given** an Eligian file, **When** the languages block appears after a styles import, **Then** the compiler reports: "languages block must be the first declaration"
4. **Given** an Eligian file, **When** the languages block appears after an action definition, **Then** the compiler reports: "languages block must be the first declaration"

---

### User Story 4 - Language Code Validation (Priority: P2)

A developer wants immediate feedback when they use an invalid language code format to prevent runtime errors.

**Why this priority**: Prevents common mistakes but doesn't block basic functionality. Can be validated independently.

**Independent Test**: Can be tested by entering various language code formats and verifying appropriate validation errors or success.

**Acceptance Scenarios**:

1. **Given** a language code in IETF format (e.g., `"en-US"`), **When** I compile, **Then** the code is accepted
2. **Given** a language code with lowercase region (e.g., `"en-us"`), **When** I compile, **Then** the compiler reports: "Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')"
3. **Given** a language code with uppercase primary (e.g., `"EN-US"`), **When** I compile, **Then** the compiler reports: "Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')"
4. **Given** duplicate language codes, **When** I compile, **Then** the compiler reports: "Duplicate language code: [code]"

---

### User Story 5 - Typir Type Integration (Priority: P3)

A developer hovering over a language declaration in VS Code wants to see type information and validation through the Typir type system.

**Why this priority**: Enhances IDE experience but not essential for compilation. Can be added after core syntax works.

**Independent Test**: Can be tested by hovering over a language declaration in VS Code and verifying the hover tooltip shows type information (e.g., "LanguagesType: 3 languages, default: en-US").

**Acceptance Scenarios**:

1. **Given** a languages block, **When** I hover over it in VS Code, **Then** I see type information showing the number of languages and the default
2. **Given** a languages block with errors, **When** Typir validates it, **Then** type errors appear as diagnostics (e.g., missing default marker)
3. **Given** a valid languages block, **When** Typir infers its type, **Then** the inferred type includes language codes and default language information

---

### Edge Cases

- What happens when a languages block is defined but empty (no language entries)?
- What happens when language labels contain special characters (quotes, backslashes, newlines)?
  - **Note**: Labels are STRING tokens in Langium, which handle standard string escaping (`\"`, `\\`, `\n`)
- What happens when a language code is valid format but not a real IETF language tag (e.g., "zz-ZZ")?
- What happens when no languages block is present in the file?
- What happens when a developer tries to define multiple languages blocks?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a `languages` block that declares available presentation languages
- **FR-002**: System MUST allow a single language declaration without requiring a default marker
- **FR-003**: System MUST require exactly one default marker (`*`) when multiple languages are declared
- **FR-004**: System MUST enforce that the `languages` block appears as the first declaration in the file (before imports, actions, timelines)
- **FR-005**: System MUST validate language codes match the IETF format: `xx-XX` (lowercase primary, uppercase region)
- **FR-006**: System MUST prevent duplicate language codes within a single languages block
- **FR-007**: System MUST compile the languages block to Eligius configuration properties: `language` (default) and `availableLanguages` (array)
- **FR-008**: System MUST generate unique IDs for each language entry in `availableLanguages` (using UUID v4 via `crypto.randomUUID()`)
- **FR-009**: System MUST make the languages block optional - if omitted, default to `language: "en-US"` and `availableLanguages: []`
- **FR-010**: System MUST integrate languages declarations with the Typir type system for IDE support
- **FR-011**: System MUST allow only ONE languages block per file
- **FR-012**: System MUST validate that at least one language is declared if the languages block is present

### Key Entities

- **LanguagesBlock**: Represents the entire `languages { ... }` declaration
  - Contains: array of language entries, position in file, default language marker
  - Relationships: Must be first declaration in Program, compiles to both `language` and `availableLanguages`

- **LanguageEntry**: Represents a single language within the block
  - Attributes: language code (TLanguageCode), display label (string), is-default flag (boolean)
  - Validation: Language code must match IETF format, no duplicates allowed

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can declare a single presentation language in under 10 seconds with zero boilerplate (just the language code and label)
- **SC-002**: Compiler catches 100% of invalid language code formats at compile time (before runtime)
- **SC-003**: Validation errors for languages blocks provide actionable messages with specific fixes (e.g., "Add * marker to one language" not "Invalid syntax")
- **SC-004**: IDE hover support shows language information (count, default) within 300ms for all languages blocks
- **SC-005**: All languages syntax compiles to valid Eligius JSON configuration that matches the IEngineConfiguration type exactly
- **SC-006**: 95% of developers can correctly write a multilingual languages block on first attempt after reading the documentation

## Assumptions

- Language codes will follow IETF BCP 47 format (primary-region, e.g., "en-US", "nl-NL")
- The Typir type system is already integrated in the project (Feature 021 completed)
- The compiler already has AST transformation infrastructure for top-level declarations
- Labels and content selection based on language is handled by Eligius runtime (not DSL compiler)
- No runtime language switching validation needed - Eligius runtime handles dynamic language changes

## Out of Scope

- Language fallback logic (handled by Eligius runtime)
- Validation that language codes are "real" IETF tags (only format validation)
- UI for language selection in presentations (Eligius runtime concern)
- Translation tooling or content management (separate feature)
- Language-specific content validation (labels feature handles this separately)
