# Data Model: Locale-Based Label Management

**Feature**: 045-locale-labels-refactor
**Date**: 2025-12-17

## Overview

This document defines the data structures for the locale-based label management system, migrating from the legacy `ILanguageLabel[]` format to Eligius 2.2.0's `ILocalesConfiguration`.

---

## Core Entities

### 1. ILocalesConfiguration (External - from Eligius)

The root configuration object for all locale data. This is the format used in JSON files and passed to the Eligius engine.

```typescript
/**
 * Top-level configuration object for all locales.
 * Keys are language codes, values are inline data or external references.
 *
 * @example
 * {
 *   "en-US": { "nav": { "home": "Home" } },
 *   "nl-NL": { "$ref": "./locales/nl-NL.json" }
 * }
 */
interface ILocalesConfiguration {
  [locale: TLanguageCode]: TLocaleEntry;
}

/** IETF language tag format (e.g., 'en-US', 'nl-NL') */
type TLanguageCode = `${Lowercase<string>}-${Uppercase<string>}`;

/** A locale entry can be inline data or an external reference */
type TLocaleEntry = TLocaleData | ILocaleReference;

/**
 * Recursive interface for nested translation data.
 * Values can be:
 * - string: Simple translation text (may contain {{interpolation}})
 * - function: Dynamic translation that receives params
 * - nested object: Nested translation keys
 */
interface TLocaleData {
  [key: string]: string | ((params: Record<string, unknown>) => string) | TLocaleData;
}

/** External file reference using JSON Reference syntax */
interface ILocaleReference {
  $ref: string;
}
```

**Validation Rules**:
- Locale codes must match `xx-XX` pattern (ISO 639-1 + ISO 3166-1)
- At least one locale must be defined
- `$ref` paths must be valid relative paths
- No circular `$ref` references allowed

---

### 2. TranslationKeyMetadata (Internal)

Metadata stored in the LocaleRegistry for each translation key.

```typescript
/**
 * Metadata for a single translation key extracted from locale data.
 * Used for hover documentation and validation.
 */
interface TranslationKeyMetadata {
  /** Full dot-notation key (e.g., "nav.home", "button.submit") */
  key: string;

  /** Map of locale code to translation value */
  translations: Map<TLanguageCode, string>;

  /** Whether all locales have this key defined */
  isComplete: boolean;

  /** List of locales missing this key (for warnings) */
  missingLocales: TLanguageCode[];
}
```

**Derived from**: Extracted by traversing `ILocalesConfiguration`

**Example**:
```typescript
{
  key: "nav.home",
  translations: new Map([
    ["en-US", "Home"],
    ["nl-NL", "Thuis"],
    ["fr-FR", "Accueil"]
  ]),
  isComplete: true,
  missingLocales: []
}
```

---

### 3. LocaleFileMetadata (Internal)

Complete metadata for a parsed locale file, stored in the LocaleRegistry.

```typescript
/**
 * Parsed metadata for a locale file.
 * Stored in LocaleRegistry for document queries.
 */
interface LocaleFileMetadata {
  /** Absolute URI of the locale file */
  fileUri: string;

  /** All locale codes defined in this file */
  locales: TLanguageCode[];

  /** All translation keys with their metadata */
  keys: TranslationKeyMetadata[];

  /** External file references (for $ref detection) */
  externalRefs: Map<TLanguageCode, string>;

  /** Whether file has any parse/validation errors */
  hasErrors: boolean;

  /** Parse/validation errors if any */
  errors: LocaleParseError[];
}
```

---

### 4. LocaleParseError (Internal)

Error information for locale file parsing failures.

```typescript
/**
 * Error encountered during locale file parsing or validation.
 */
interface LocaleParseError {
  /** Error code for programmatic handling */
  code: 'invalid_json' | 'invalid_schema' | 'missing_locale' | 'circular_ref' | 'file_not_found';

  /** Human-readable error message */
  message: string;

  /** Actionable hint for fixing the error */
  hint: string;

  /** Source location if applicable */
  location?: {
    line: number;
    column: number;
  };

  /** Additional details (e.g., circular ref path) */
  details?: string;
}
```

---

## Editor Data Model

### 5. LocaleEditorState (Webview)

State managed in the locale editor webview.

```typescript
/**
 * State for the locale editor webview.
 * Bidirectional sync with VS Code extension.
 */
interface LocaleEditorState {
  /** All locale codes in this file */
  locales: TLanguageCode[];

  /** Tree structure for navigation panel */
  keyTree: KeyTreeNode[];

  /** Currently selected key (for editing panel) */
  selectedKey: string | null;

  /** Flat list of all keys for search */
  allKeys: string[];

  /** Validation errors by key */
  errors: Map<string, ValidationError[]>;

  /** Whether file has unsaved changes */
  isDirty: boolean;
}

/**
 * Node in the key tree for navigation panel.
 */
interface KeyTreeNode {
  /** Segment name (e.g., "nav" or "home") */
  name: string;

  /** Full key path (e.g., "nav.home") */
  fullKey: string;

  /** Whether this node has a translation value (leaf node) */
  isLeaf: boolean;

  /** Child nodes (empty for leaf nodes) */
  children: KeyTreeNode[];

  /** Translations for this key (only for leaf nodes) */
  translations?: Map<TLanguageCode, string>;
}
```

---

### 6. LocaleEditorMessage (Extension ↔ Webview)

Messages for bidirectional communication between extension and webview.

```typescript
/**
 * Messages sent from Extension to Webview
 */
type ToWebviewMessage =
  | {
      type: 'initialize';
      locales: TLanguageCode[];
      keyTree: KeyTreeNode[];
      filePath: string;
    }
  | {
      type: 'select-key';
      key: string;
    }
  | {
      type: 'reload';
      locales: TLanguageCode[];
      keyTree: KeyTreeNode[];
    }
  | {
      type: 'validation-error';
      errors: Map<string, ValidationError[]>;
    }
  | {
      type: 'save-complete';
      success: boolean;
    };

/**
 * Messages sent from Webview to Extension
 */
type ToExtensionMessage =
  | {
      type: 'ready';
    }
  | {
      type: 'update-translation';
      key: string;
      locale: TLanguageCode;
      value: string;
    }
  | {
      type: 'add-key';
      parentKey: string | null;  // null for root level
      newSegment: string;
    }
  | {
      type: 'delete-key';
      key: string;
    }
  | {
      type: 'rename-key';
      oldKey: string;
      newKey: string;
    }
  | {
      type: 'request-save';
    };
```

---

## Compiler Data Model

### 7. LocaleCompilerOutput (Compiler)

Locale data in the compiled Eligius configuration.

```typescript
/**
 * Locale data in compiled configuration.
 * Passed directly to Eligius engine factory.
 */
interface EligiusConfiguration {
  // ... other config properties ...

  /** Locale configuration (replaces legacy 'labels' property) */
  locales?: ILocalesConfiguration;

  /** Default language code */
  language: TLanguageCode;
}
```

---

### 8. LabelControllerOperationData (Compiler)

Operation data generated for LabelController in compiled output.

```typescript
/**
 * OLD (Legacy - Eligius <2.2.0):
 */
interface LegacyLabelControllerData {
  labelId: string;  // References ILanguageLabel.id
  attributeName?: string;
}

/**
 * NEW (Eligius 2.2.0+):
 */
interface LabelControllerOperationData {
  translationKey: string;  // Dot-notation key like "nav.home"
  attributeName?: string;
}
```

---

## State Transitions

### Locale File Lifecycle

```
┌─────────────────┐
│   File Created  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Parse JSON    │────▶│  Schema Valid?  │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
         ┌─────────────────┐      ┌─────────────────┐
         │   Valid File    │      │  Invalid File   │
         └────────┬────────┘      └────────┬────────┘
                  │                        │
                  ▼                        ▼
         ┌─────────────────┐      ┌─────────────────┐
         │ Extract Keys    │      │ Show Errors     │
         └────────┬────────┘      └─────────────────┘
                  │
                  ▼
         ┌─────────────────┐
         │ Register in     │
         │ LocaleRegistry  │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │ Enable IDE      │
         │ Features        │
         └─────────────────┘
```

### Translation Key States

| State | Description | IDE Behavior |
|-------|-------------|--------------|
| `defined` | Key exists in all locales | Normal completion, hover |
| `partial` | Key missing in some locales | Warning diagnostic |
| `unknown` | Key used but not defined | Error diagnostic |
| `unused` | Key defined but never used | Info diagnostic (optional) |

---

## Relationships

```
┌──────────────────────────────────────────────────────────────┐
│                    .eligian Document                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ locales "./locales.json"                               │  │
│  │                                                        │  │
│  │ addController("LabelController", "nav.home")           │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬────────────────────────────────┘
                              │ imports
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    locales.json                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ {                                                      │  │
│  │   "en-US": { "nav": { "home": "Home" } },             │  │
│  │   "nl-NL": { "$ref": "./nl-NL.json" }                 │  │
│  │ }                                                      │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬────────────────────────────────┘
                              │ $ref
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    nl-NL.json                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ { "nav": { "home": "Thuis" } }                         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Migration: Legacy to Modern Format

### Legacy Format (ILanguageLabel[])
```json
[
  {
    "id": "nav.home",
    "labels": [
      { "id": "uuid-1", "languageCode": "en-US", "label": "Home" },
      { "id": "uuid-2", "languageCode": "nl-NL", "label": "Thuis" }
    ]
  }
]
```

### Modern Format (ILocalesConfiguration)
```json
{
  "en-US": { "nav": { "home": "Home" } },
  "nl-NL": { "nav": { "home": "Thuis" } }
}
```

### Migration Algorithm
1. Collect all unique locale codes from legacy labels
2. Create empty object for each locale
3. For each label group:
   - Parse `id` as dot-notation path (e.g., "nav.home" → ["nav", "home"])
   - For each translation, set nested value in appropriate locale
4. Output new JSON structure
