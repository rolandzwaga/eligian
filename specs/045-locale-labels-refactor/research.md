# Research: Locale-Based Label Management Refactor

**Feature**: 045-locale-labels-refactor
**Date**: 2025-12-17

## Overview

This document captures research findings and technical decisions for migrating from the legacy `ILanguageLabel[]` format to Eligius 2.2.0's `ILocalesConfiguration` nested locale structure.

---

## R1: ILocalesConfiguration Structure Analysis

### Question
How exactly is the new `ILocalesConfiguration` structured and how does it differ from the legacy format?

### Research Findings

**Legacy Format (`ILanguageLabel[]`)**:
```typescript
// Array of label groups, each with translations as array
interface ILanguageLabel {
  id: string;                    // "welcome.title"
  labels: Array<{
    id: string;                  // UUID for each translation
    languageCode: string;        // "en-US"
    label: string;               // "Welcome"
  }>;
}
```

**New Format (`ILocalesConfiguration`)**:
```typescript
// Object keyed by locale, values are nested translation objects
interface ILocalesConfiguration {
  [locale: TLanguageCode]: TLocaleEntry;  // "en-US": { nav: { home: "Home" } }
}

type TLocaleEntry = TLocaleData | ILocaleReference;

interface TLocaleData {
  [key: string]: string | ((params: Record<string, unknown>) => string) | TLocaleData;
}

interface ILocaleReference {
  $ref: string;  // Path to external JSON file
}
```

### Decision
**Use nested structure with dot-notation key extraction**

### Rationale
- Matches rosetta's `t('nav.home')` API
- Allows for deeper nesting than flat IDs
- Supports interpolation with `{{variable}}` syntax
- External file references via `$ref` reduce file size

### Alternatives Considered
1. **Flatten at import time**: Convert nested to flat keys during parsing
   - Rejected: Loses nesting information needed for tree view in editor
2. **Keep both formats in editor**: Show both flat and nested views
   - Rejected: Adds complexity without clear user benefit

---

## R2: Translation Key Extraction Algorithm

### Question
How do we extract all valid translation keys from a nested `TLocaleData` object?

### Research Findings

Translation keys in rosetta use dot-notation: `"nav.home"` maps to `{ nav: { home: "value" } }`.

Algorithm requirements:
1. Recursively traverse nested objects
2. Stop at leaf nodes (strings or functions)
3. Join path segments with dots
4. Handle functions (dynamic translations) as valid keys

### Decision
**Recursive traversal with path accumulation**

```typescript
function extractTranslationKeys(data: TLocaleData, prefix = ''): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string' || typeof value === 'function') {
      keys.push(fullKey);
    } else if (typeof value === 'object' && value !== null) {
      keys.push(...extractTranslationKeys(value as TLocaleData, fullKey));
    }
  }

  return keys;
}
```

### Rationale
- Simple recursive algorithm matches data structure
- Handles arbitrary nesting depth
- Supports both string and function values
- O(n) complexity where n = number of keys

### Alternatives Considered
1. **Iterative with stack**: Use explicit stack instead of recursion
   - Rejected: More complex code, no real benefit for typical nesting depths
2. **Generator function**: Yield keys lazily
   - Rejected: We need all keys upfront for completion/validation

---

## R3: External File Reference ($ref) Handling

### Question
How should we handle `$ref` external file references in locale configurations?

### Research Findings

Eligius supports `$ref` syntax for external locale files:
```json
{
  "en-US": { "$ref": "./locales/en-US.json" },
  "nl-NL": { "$ref": "./locales/nl-NL.json" }
}
```

The `LocaleLoader` class in Eligius:
- Resolves relative paths against base URL
- Caches loaded files
- Detects circular references
- Supports nested `$ref` within locale data

### Decision
**Resolve $ref at compile/validation time with caching**

Implementation approach:
1. Detect `$ref` during locale file parsing
2. Resolve relative path against importing file's directory
3. Load and parse referenced file
4. Cache resolved content for hot-reload efficiency
5. Track visited files for circular reference detection

### Rationale
- Compile-time resolution catches errors early
- Caching improves performance for repeated access
- Circular detection prevents infinite loops
- Matches Eligius runtime behavior

### Alternatives Considered
1. **Runtime-only resolution**: Only Eligius engine resolves refs
   - Rejected: No IDE support for validation/completion
2. **Inline expansion**: Expand $ref into main file
   - Rejected: Loses file organization benefits

---

## R4: Editor UI Design for Nested Locale Data

### Question
How should the visual editor display and edit nested locale structures?

### Research Findings

Current label editor uses flat list:
```
Group: welcome.title
├── en-US: "Welcome"
└── nl-NL: "Welkom"
```

New nested data needs hierarchical representation:
```
nav
├── home
│   ├── en-US: "Home"
│   └── nl-NL: "Thuis"
└── about
    ├── en-US: "About"
    └── nl-NL: "Over"
```

### Decision
**Two-panel design: Tree view + Translation table**

Layout:
```
┌────────────────────┬────────────────────────────────────┐
│ Translation Keys   │ Translations                        │
├────────────────────┼────────────────────────────────────┤
│ ▼ nav              │ Key: nav.home                       │
│   ├── home  ◄────────────────────────────────────────────┤
│   └── about        │ en-US: [Home          ]             │
│ ▼ button           │ nl-NL: [Thuis         ]             │
│   └── submit       │ fr-FR: [Accueil       ]             │
└────────────────────┴────────────────────────────────────┘
```

Features:
- Tree view on left shows key hierarchy
- Table on right shows translations for selected key
- Add key button inserts to all locales with placeholder
- Delete key removes from all locales
- Drag-drop for key reorganization (future)

### Rationale
- Tree view matches nested data structure
- Table view allows easy comparison across locales
- Separates navigation from editing
- Familiar pattern (similar to VS Code settings, i18n tools)

### Alternatives Considered
1. **Spreadsheet view**: Keys as rows, locales as columns
   - Rejected: Poor UX for deeply nested keys (wide rows)
2. **Flat list with indentation**: Show all keys with visual indentation
   - Rejected: Loses expandable tree benefits
3. **JSON editor with syntax highlighting**: Direct JSON editing
   - Rejected: Defeats purpose of visual editor

---

## R5: LabelController Parameter Migration

### Question
How do we update the compiler to use `translationKey` instead of `labelId`?

### Research Findings

Current AST transformer generates:
```typescript
// addController("LabelController", "welcome.title")
{
  operationName: 'addControllerToElement',
  operationData: { labelId: 'welcome.title' }
}
```

Eligius 2.2.0 expects:
```typescript
{
  operationName: 'addControllerToElement',
  operationData: { translationKey: 'nav.home' }
}
```

### Decision
**Update ast-transformer.ts to emit `translationKey`**

Changes in `transformOperationStatement()`:
```typescript
// Before
if (controllerName === 'LabelController') {
  return { labelId: secondArg };
}

// After
if (controllerName === 'LabelController') {
  return { translationKey: secondArg };
}
```

### Rationale
- Simple one-line change in transformer
- No DSL syntax changes needed
- Aligns with Eligius 2.2.0 API

### Alternatives Considered
1. **New syntax**: `addController("LabelController", key="nav.home")`
   - Rejected: Breaking change to DSL syntax
2. **Both properties**: Emit both `labelId` and `translationKey`
   - Rejected: Confusing, Eligius only uses `translationKey`

---

## R6: LocaleRegistry Service Design

### Question
How should we structure the new LocaleRegistry to track translation keys?

### Research Findings

Current `LabelRegistryService` pattern:
- `labelsByFile: Map<string, LabelGroupMetadata[]>`
- `labelsFileByDocument: Map<string, string>`
- Methods: `updateLabelsFile`, `registerImports`, `getLabelIDsForDocument`

CSS Registry pattern (similar):
- `cssFilesByUri: Map<string, CSSParseResult>`
- `documentImports: Map<string, Set<string>>`
- Methods: `updateCSSFile`, `registerImports`, `getClassesForDocument`

### Decision
**Follow CSS Registry pattern with translation key metadata**

```typescript
interface TranslationKeyMetadata {
  key: string;                    // "nav.home"
  translations: Map<string, string>;  // locale → value
}

class LocaleRegistryService {
  private localesByFile: Map<string, {
    keys: TranslationKeyMetadata[];
    locales: string[];
  }>;
  private localeFileByDocument: Map<string, string>;

  updateLocaleFile(fileUri: string, metadata: LocaleFileMetadata): void;
  registerImports(documentUri: string, localeFileUri: string): void;
  getTranslationKeysForDocument(documentUri: string): Set<string>;
  findKeyMetadata(documentUri: string, key: string): TranslationKeyMetadata | undefined;
}
```

### Rationale
- Consistent with existing registry patterns
- Stores enough metadata for hover (all translations)
- Efficient lookup for validation
- Hot-reload friendly (replaces on update)

### Alternatives Considered
1. **Flat key storage**: Just store Set<string> of keys
   - Rejected: Loses translation values needed for hover
2. **Per-locale registries**: Separate registry per locale
   - Rejected: Complicates cross-locale operations

---

## Summary of Key Decisions

| Decision | Choice | Key Rationale |
|----------|--------|---------------|
| Data Structure | Nested `ILocalesConfiguration` | Matches Eligius 2.2.0 API |
| Key Extraction | Recursive traversal | Simple, O(n), matches data |
| $ref Handling | Compile-time resolution | Early error detection |
| Editor UI | Tree view + Translation table | Intuitive for nested data |
| Compiler Change | `labelId` → `translationKey` | One-line transformer fix |
| Registry Design | CSS Registry pattern | Proven pattern in codebase |
