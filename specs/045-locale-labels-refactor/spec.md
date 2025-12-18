# Feature Specification: Locale-Based Label Management Refactor

**Feature Branch**: `045-locale-labels-refactor`
**Created**: 2025-12-17
**Status**: Draft
**Input**: User description: "label management refactor. Eligius 2.2.0 was installed in the project. It contains a big breaking change to the way labels and locales are handled which will have a pretty big impact on our label editor."

## Overview

Eligius 2.2.0 introduces a **complete overhaul of the label/translation system**, replacing the legacy flat `ILanguageLabel[]` array with a **nested locale-based structure** (`ILocalesConfiguration`). This migration affects multiple components across the Eligian extension, compiler, and editor.

### Key Breaking Changes in Eligius 2.2.0

| Component | Old (Pre-2.2.0) | New (2.2.0+) |
|-----------|----------------|--------------|
| Configuration property | `labels: ILanguageLabel[]` | `locales: ILocalesConfiguration` |
| Data structure | Flat array with `{ id, labels: [{ languageCode, label }] }` | Nested object `{ "en-US": { "nav.home": "Home" } }` |
| LabelController parameter | `labelId: string` (references `ILanguageLabel.id`) | `translationKey: string` (dot-notation path like `"nav.home"`) |
| Factory result | `languageManager: ILanguageManager` | `localeManager: ILocaleManager` |
| Runtime lookup | `getLabelCollection(labelId)` | `t('nav.home')` via rosetta library |
| External files | N/A | `{ "$ref": "./locales/en-US.json" }` syntax |

### Old Format (Legacy)
```json
{
  "labels": [
    {
      "id": "welcome.title",
      "labels": [
        { "id": "uuid-1", "languageCode": "en-US", "label": "Welcome" },
        { "id": "uuid-2", "languageCode": "nl-NL", "label": "Welkom" }
      ]
    }
  ]
}
```

### New Format (Eligius 2.2.0)
```json
{
  "locales": {
    "en-US": {
      "welcome": { "title": "Welcome" },
      "button": { "submit": "Submit" }
    },
    "nl-NL": {
      "welcome": { "title": "Welkom" },
      "button": { "submit": "Verzenden" }
    }
  }
}
```

## User Scenarios & Testing

### User Story 1 - Import and Use Locale Data (Priority: P1)

As a developer, I want to import locale data files and use translation keys in my Eligian code so that my presentations display localized text.

**Why this priority**: This is the foundation for all localization functionality. Without working locale imports, no other features can function.

**Independent Test**: Can be fully tested by creating a `.eligian` file with locale imports and verifying the compiler outputs valid `locales` configuration.

**Acceptance Scenarios**:

1. **Given** an Eligian file with `locales "./locales.json"` import, **When** compiled, **Then** the output configuration includes the `locales` object with all locale data
2. **Given** an Eligian file using `addController("LabelController", "nav.home")`, **When** compiled, **Then** the output uses `translationKey: "nav.home"` instead of `labelId`
3. **Given** a locales file with nested structure `{ "en-US": { "nav": { "home": "Home" } } }`, **When** imported, **Then** translation keys like `"nav.home"` resolve correctly

---

### User Story 2 - Edit Locale Data in Visual Editor (Priority: P1)

As a developer, I want to use a visual editor to manage my locale translations without manually editing JSON so that I can efficiently create and update translations.

**Why this priority**: The visual editor is critical for productivity. Without it, developers must manually edit complex nested JSON structures, which is error-prone.

**Independent Test**: Can be tested by opening a locale file in VS Code and verifying the editor displays all locales and translations with edit capabilities.

**Acceptance Scenarios**:

1. **Given** a locale JSON file, **When** opened in VS Code, **Then** the custom editor displays all locales with their nested translations
2. **Given** the locale editor with an existing translation, **When** I edit the text and save, **Then** the JSON file is updated with the new translation
3. **Given** the locale editor, **When** I add a new translation key, **Then** it is added to all locales with placeholder text
4. **Given** the locale editor, **When** I delete a translation key, **Then** it is removed from all locales after confirmation

---

### User Story 3 - Translation Key Autocomplete (Priority: P2)

As a developer, I want autocomplete suggestions for translation keys when using LabelController so that I can quickly find the correct key without checking the locale file.

**Why this priority**: Autocomplete significantly improves developer experience but the system can function without it.

**Independent Test**: Can be tested by typing `addController("LabelController", "` and verifying that available translation keys appear as suggestions.

**Acceptance Scenarios**:

1. **Given** an Eligian file with locale imports, **When** I type `addController("LabelController", "` and trigger autocomplete, **Then** I see all available translation keys (e.g., `nav.home`, `button.submit`)
2. **Given** partial input `"nav.`, **When** I trigger autocomplete, **Then** suggestions are filtered to keys starting with `nav.`
3. **Given** a nested translation structure, **When** viewing completions, **Then** keys are shown in dot-notation format

---

### User Story 4 - Hover Documentation for Translation Keys (Priority: P2)

As a developer, I want to see the actual translation text when hovering over a translation key so that I can verify I'm using the correct key.

**Why this priority**: Hover documentation improves code understanding but is not essential for functionality.

**Independent Test**: Can be tested by hovering over a translation key and verifying the hover tooltip shows translations for all locales.

**Acceptance Scenarios**:

1. **Given** a LabelController with translation key `"nav.home"`, **When** I hover over the key, **Then** I see the translations for all locales (e.g., "en-US: Home, nl-NL: Thuis")
2. **Given** a translation key that doesn't exist, **When** I hover over it, **Then** I see a warning that the key is not found

---

### User Story 5 - Validate Translation Key Existence (Priority: P2)

As a developer, I want the compiler to warn me when I use a translation key that doesn't exist so that I can fix typos before runtime.

**Why this priority**: Validation catches errors early but is not required for basic functionality.

**Independent Test**: Can be tested by using a non-existent translation key and verifying a diagnostic warning appears.

**Acceptance Scenarios**:

1. **Given** a LabelController with translation key `"nav.homee"` (typo), **When** validating, **Then** a warning appears: "Unknown translation key: 'nav.homee'"
2. **Given** a valid translation key, **When** validating, **Then** no warning appears
3. **Given** a typo in translation key, **When** the warning appears, **Then** it includes "Did you mean: 'nav.home'?" suggestion

---

### User Story 6 - Create New Locale File via Quick Fix (Priority: P3)

As a developer, I want to quickly create a locale file when one doesn't exist so that I can start adding translations immediately.

**Why this priority**: Quick fixes improve workflow but manual file creation is acceptable.

**Independent Test**: Can be tested by writing `locales "./locales.json"` for a non-existent file and using the quick fix action.

**Acceptance Scenarios**:

1. **Given** a `locales` import pointing to non-existent file, **When** I click the quick fix, **Then** the file is created with initial structure based on the `languages` block
2. **Given** a newly created locale file, **When** opened, **Then** it contains empty translation objects for each declared language

---

### User Story 7 - External Locale File References (Priority: P3)

As a developer, I want to reference external locale files per language so that I can organize translations in separate files.

**Why this priority**: External references are an advanced feature for large projects.

**Independent Test**: Can be tested by creating locale files with `$ref` syntax and verifying they resolve correctly.

**Acceptance Scenarios**:

1. **Given** a locales file with `{ "en-US": { "$ref": "./en-US.json" } }`, **When** compiled, **Then** the referenced file content is loaded and merged
2. **Given** an external locale file that doesn't exist, **When** validating, **Then** an error appears indicating the missing file

---

### Edge Cases

- What happens when a locale file has invalid JSON syntax? (Show parse error with location)
- What happens when a translation key contains invalid characters? (Validate dot-notation format)
- What happens when the same translation key is defined multiple times? (Last definition wins, show warning)
- How does the system handle empty locale objects? (Allow empty, warn if no translations)

## Requirements

### Functional Requirements

#### Compiler & Language Server

- **FR-001**: System MUST support `locales` import statement syntax: `locales "./path/to/locales.json"`
- **FR-002**: System MUST validate locale file structure against the new `ILocalesConfiguration` schema
- **FR-003**: System MUST transform `addController("LabelController", "key")` to use `translationKey` instead of `labelId`
- **FR-004**: System MUST support nested translation key resolution (e.g., `"nav.home"` resolves to `{ nav: { home: "..." } }`)
- **FR-005**: System MUST provide autocomplete for translation keys based on imported locale data
- **FR-006**: System MUST validate that used translation keys exist in the locale data
- **FR-007**: System MUST provide "Did you mean?" suggestions for misspelled translation keys
- **FR-008**: System MUST support external locale file references via `$ref` syntax
- **FR-009**: System MUST detect circular references in external locale files

#### Label Editor (Visual Editor)

- **FR-010**: Editor MUST display locale data organized by language code
- **FR-011**: Editor MUST display translation keys in a hierarchical tree view reflecting the nested structure
- **FR-012**: Editor MUST allow adding new translation keys to all locales simultaneously
- **FR-013**: Editor MUST allow editing translation values per locale
- **FR-014**: Editor MUST allow deleting translation keys from all locales
- **FR-015**: Editor MUST validate translation key format (valid identifier characters, dot-notation)
- **FR-016**: Editor MUST validate language code format (`xx-XX` pattern)
- **FR-017**: Editor MUST show usage tracking (which `.eligian` files use each translation key)
- **FR-018**: Editor MUST support undo/redo for all editing operations

### Key Entities

- **Locale**: A language-region combination (e.g., `en-US`) containing all translations for that locale
- **Translation Key**: A dot-notation path identifying a specific translation (e.g., `nav.home`, `button.submit`)
- **Translation Value**: The actual text content for a translation key in a specific locale
- **Locale Reference**: An external file reference using `$ref` syntax pointing to another JSON file

## Success Criteria

### Measurable Outcomes

- **SC-001**: Developers can create and use locale-based translations in under 5 minutes
- **SC-002**: All existing label editor functionality is preserved in the new locale editor
- **SC-003**: Translation key autocomplete provides suggestions in under 200ms
- **SC-004**: Build passes with zero errors or warnings related to locale handling
- **SC-005**: All new locale-related tests pass with adequate coverage

## Assumptions

- Eligius 2.2.0 is already installed in the project (confirmed via package.json)
- The rosetta library (~300 bytes) handles translation interpolation at runtime
- External locale file references are resolved at compile time, not runtime
- The `languages` block in `.eligian` files determines which locales are expected
- Translation keys should follow valid JavaScript identifier naming (alphanumeric, dots, underscores)

## Dependencies

- Eligius 2.2.0 (`eligius` npm package)
- Rosetta library (bundled with Eligius)
- Existing label editor infrastructure (`packages/extension/src/extension/label-editor/`)
- Existing label validation infrastructure (`packages/language/src/validators/`)
- Existing label completion infrastructure (`packages/language/src/completion/`)

## Out of Scope

- Runtime locale switching UI (handled by Eligius engine)
- Translation management platforms integration (e.g., Crowdin, Lokalise)
- Automatic translation suggestions (AI-based)
- Pluralization rules (defer to Eligius/rosetta implementation)
