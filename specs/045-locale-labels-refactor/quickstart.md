# Quickstart: Locale-Based Label Management

**Feature**: 045-locale-labels-refactor
**Date**: 2025-12-17

## Overview

This guide shows how to use the new locale-based translation system in Eligian, which replaces the legacy label format in Eligius 2.2.0+.

---

## Creating a Locale File

### 1. Create the JSON file

Create a `locales.json` file in your project:

```json
{
  "en-US": {
    "nav": {
      "home": "Home",
      "about": "About Us",
      "contact": "Contact"
    },
    "button": {
      "submit": "Submit",
      "cancel": "Cancel"
    },
    "greeting": "Hello, {{name}}!"
  },
  "nl-NL": {
    "nav": {
      "home": "Thuis",
      "about": "Over Ons",
      "contact": "Contact"
    },
    "button": {
      "submit": "Verzenden",
      "cancel": "Annuleren"
    },
    "greeting": "Hallo, {{name}}!"
  }
}
```

### 2. Import in your .eligian file

```eligian
// Import locales
locales "./locales.json"

// Define supported languages
languages {
  *"en-US" "English"
  "nl-NL" "Nederlands"
}

// Use translation keys with LabelController
timeline "My Presentation" at 0s {
  at 0s..5s selectElement("#title") {
    addController("LabelController", "nav.home")
  }

  at 5s..10s selectElement("#greeting") {
    addController("LabelController", "greeting")
  }
}
```

---

## Using External File References

For larger projects, split locales into separate files:

### locales.json
```json
{
  "en-US": { "$ref": "./locales/en-US.json" },
  "nl-NL": { "$ref": "./locales/nl-NL.json" },
  "fr-FR": { "$ref": "./locales/fr-FR.json" }
}
```

### locales/en-US.json
```json
{
  "nav": {
    "home": "Home",
    "about": "About Us"
  }
}
```

### locales/nl-NL.json
```json
{
  "nav": {
    "home": "Thuis",
    "about": "Over Ons"
  }
}
```

---

## IDE Features

### Autocomplete

When typing a translation key, press `Ctrl+Space` for suggestions:

```eligian
addController("LabelController", "nav.|")
                                      ^
                                      Suggestions:
                                      - nav.home
                                      - nav.about
                                      - nav.contact
```

### Hover Documentation

Hover over a translation key to see all translations:

```
Translation Key: nav.home

Translations:
  en-US: "Home"
  nl-NL: "Thuis"
  fr-FR: "Accueil"
```

### Validation

Unknown translation keys show a warning:

```eligian
addController("LabelController", "nav.homee")
                                 ~~~~~~~~~~~~
                                 Warning: Unknown translation key: 'nav.homee'
                                 Did you mean: 'nav.home'?
```

---

## Visual Editor

### Opening the Editor

1. Right-click on a `.json` locale file
2. Select "Open With..." → "Eligian Locale Editor"

Or use the command palette:
- `Ctrl+Shift+P` → "Eligian: Open Locale Editor"

### Editor Layout

```
┌────────────────────┬────────────────────────────────────┐
│ Translation Keys   │ Translations                        │
├────────────────────┼────────────────────────────────────┤
│ ▼ nav              │ Key: nav.home                       │
│   ├── home  ◄──────┼──────────────────────────────────────│
│   ├── about        │ en-US: [Home          ]             │
│   └── contact      │ nl-NL: [Thuis         ]             │
│ ▼ button           │ fr-FR: [Accueil       ]             │
│   ├── submit       │                                     │
│   └── cancel       │ [Add Translation]                   │
└────────────────────┴────────────────────────────────────┘
```

### Adding a New Translation Key

1. Click "Add Key" button
2. Enter key path (e.g., `nav.settings`)
3. Enter translations for each locale
4. Press `Ctrl+S` to save

### Deleting a Translation Key

1. Select the key in the tree view
2. Click "Delete Key" button
3. Confirm deletion (shows usage in .eligian files)

---

## Migration from Legacy Format

### Detecting Legacy Files

Legacy label files use array format:

```json
[
  {
    "id": "nav.home",
    "labels": [
      { "id": "uuid-1", "languageCode": "en-US", "label": "Home" }
    ]
  }
]
```

Opening a legacy file shows a deprecation warning with migration option.

### Automatic Migration

1. Open the legacy file in VS Code
2. Click "Migrate to New Format" in the notification
3. Review the converted file
4. Save to complete migration

### Manual Migration

Run from command palette:
- `Ctrl+Shift+P` → "Eligian: Migrate Labels to Locales"

---

## Interpolation

Use `{{variable}}` syntax for dynamic values:

### In locale file:
```json
{
  "en-US": {
    "welcome": "Welcome, {{username}}!",
    "items": "You have {{count}} items"
  }
}
```

### At runtime:
The Eligius engine passes interpolation parameters when rendering:
```typescript
localeManager.t('welcome', { username: 'Alice' });
// → "Welcome, Alice!"
```

---

## Best Practices

### Key Naming
- Use dot-notation for hierarchy: `nav.home`, `button.submit`
- Use lowercase with hyphens for multi-word segments: `error-messages.not-found`
- Keep keys descriptive but concise

### File Organization
- Small projects: Single `locales.json` with inline data
- Large projects: Use `$ref` with one file per locale
- Very large projects: Split by feature (`locales/nav.json`, `locales/errors.json`)

### Consistency
- Define all keys in all locales (IDE warns about missing translations)
- Use placeholders for untranslated text: `"[TODO] Home page title"`

---

## Troubleshooting

### "Unknown translation key" warning
- Check spelling of the key
- Verify the locale file is imported with `locales "..."`
- Ensure the key exists in all locales

### "Invalid locale file format" error
- Check JSON syntax (missing commas, unclosed brackets)
- Verify locale codes match `xx-XX` pattern (e.g., `en-US`, not `en_US`)
- Ensure no circular `$ref` references

### Editor not opening
- Verify file has `.json` extension
- Check file is valid JSON (no syntax errors)
- Try "Open With..." → "Text Editor" to fix JSON issues first
