# Quickstart: Languages Declaration Syntax

**Feature**: 037-languages-syntax
**Date**: 2025-11-23

## Overview

The languages syntax allows you to declare available presentation languages and specify a default language. This is useful for internationalized presentations that support multiple languages.

---

## Basic Usage

### Single Language (Implicit Default)

The simplest case - just declare one language. It automatically becomes the default.

```eligian
languages {
  "en-US" "English"
}

layout "./index.html"
timeline "Demo" at 0s {
  at 0s..5s selectElement("#box") {
    animate({opacity: 1}, 1000)
  }
}
```

**Compiles to**:
```json
{
  "language": "en-US",
  "availableLanguages": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "languageCode": "en-US",
      "label": "English"
    }
  ]
}
```

---

### Multiple Languages (Explicit Default)

When you have multiple languages, use the `*` marker to indicate which one is the default.

```eligian
languages {
  * "nl-NL" "Nederlands"
    "en-US" "English"
    "fr-FR" "Français"
    "de-DE" "Deutsch"
}

layout "./index.html"
timeline "Demo" at 0s { /* ... */ }
```

**Compiles to**:
```json
{
  "language": "nl-NL",
  "availableLanguages": [
    { "id": "...", "languageCode": "nl-NL", "label": "Nederlands" },
    { "id": "...", "languageCode": "en-US", "label": "English" },
    { "id": "...", "languageCode": "fr-FR", "label": "Français" },
    { "id": "...", "languageCode": "de-DE", "label": "Deutsch" }
  ]
}
```

---

## Language Code Format

Language codes must follow the **IETF BCP 47** format: `xx-XX`
- **Primary language**: 2-3 lowercase letters (e.g., `en`, `nl`, `fr`, `pt`)
- **Hyphen**: `-`
- **Region**: 2-3 uppercase letters (e.g., `US`, `NL`, `FR`, `BR`)

**Valid Examples**:
- ✅ `"en-US"` (English - United States)
- ✅ `"nl-NL"` (Dutch - Netherlands)
- ✅ `"fr-FR"` (French - France)
- ✅ `"pt-BR"` (Portuguese - Brazil)
- ✅ `"de-DE"` (German - Germany)

**Invalid Examples**:
- ❌ `"EN-US"` (uppercase primary)
- ❌ `"en-us"` (lowercase region)
- ❌ `"english"` (no region)
- ❌ `"en_US"` (underscore instead of hyphen)

---

## Position Requirement

The `languages` block **must be the first declaration** in your Eligian file. It must appear before:
- `layout` imports
- `styles` imports
- `labels` imports
- `action` definitions
- `timeline` definitions

**✅ Correct**:
```eligian
languages {
  "en-US" "English"
}

layout "./index.html"
styles "./styles.css"
timeline "Demo" at 0s { /* ... */ }
```

**❌ Incorrect**:
```eligian
layout "./index.html"

languages {  // ❌ Error: languages block must be first
  "en-US" "English"
}
```

---

## Validation Rules

### 1. Default Marker Rules

**Single language**: No `*` marker needed (implicit default)
```eligian
languages {
  "en-US" "English"  // ✅ Automatically default
}
```

**Multiple languages**: Exactly one `*` marker required
```eligian
languages {
  * "en-US" "English"  // ✅ Explicit default
    "nl-NL" "Nederlands"
}
```

**❌ Error: No default marker**
```eligian
languages {
  "en-US" "English"
  "nl-NL" "Nederlands"  // ❌ Missing * marker
}
```
Error: `Multiple languages require exactly one * marker to indicate the default`

**❌ Error: Multiple default markers**
```eligian
languages {
  * "en-US" "English"
  * "nl-NL" "Nederlands"  // ❌ Two markers
}
```
Error: `Only one language can be marked as default`

---

### 2. No Duplicate Language Codes

Each language code can only appear once.

**✅ Correct**:
```eligian
languages {
  "en-US" "English"
  "en-GB" "British English"  // Different code, OK
}
```

**❌ Incorrect**:
```eligian
languages {
  "en-US" "English"
  "en-US" "American English"  // ❌ Duplicate
}
```
Error: `Duplicate language code: 'en-US'`

---

### 3. Only One Languages Block

You can only have one `languages` block per file.

**❌ Incorrect**:
```eligian
languages {
  "en-US" "English"
}

languages {  // ❌ Only one block allowed
  "nl-NL" "Nederlands"
}
```
Error: `Only one languages block allowed per file`

---

## IDE Support

### Hover Tooltips

When you hover over a `languages` block in VS Code, you'll see type information:

**Single language**:
```
Languages: 1 language, default: en-US
```

**Multiple languages**:
```
Languages: 3 languages, default: nl-NL
```

### Error Highlighting

Invalid language codes, duplicate codes, and missing default markers are highlighted in red with actionable error messages.

---

## Migration Guide

### Adding Languages to Existing Project

If your project doesn't have a `languages` block, it defaults to `en-US`:

**Before** (no languages block):
```eligian
layout "./index.html"
timeline "Demo" at 0s { /* ... */ }
```

**After** (explicit single language):
```eligian
languages {
  "en-US" "English"
}

layout "./index.html"
timeline "Demo" at 0s { /* ... */ }
```

**After** (multiple languages):
```eligian
languages {
  * "en-US" "English"
    "es-ES" "Español"
    "fr-FR" "Français"
}

layout "./index.html"
timeline "Demo" at 0s { /* ... */ }
```

---

### Converting Single Language to Multiple Languages

When you add a second language, remember to add the `*` marker to indicate the default.

**Before** (single language):
```eligian
languages {
  "en-US" "English"
}
```

**After** (multiple languages):
```eligian
languages {
  * "en-US" "English"  // Add * marker when adding second language
    "nl-NL" "Nederlands"
}
```

---

## Complete Example

```eligian
// Languages declaration (must be first)
languages {
  * "en-US" "English"
    "nl-NL" "Nederlands"
    "fr-FR" "Français"
    "de-DE" "Deutsch"
}

// Asset imports
layout "./index.html"
styles "./styles.css"
labels "./labels.json"

// Custom actions
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

// Timeline
timeline "Multi-Language Demo" in "#app" using raf {
  at 0s..5s fadeIn("#welcome", 1000)
}
```

**Generated Configuration** (excerpt):
```json
{
  "language": "en-US",
  "availableLanguages": [
    { "id": "550e8400-...", "languageCode": "en-US", "label": "English" },
    { "id": "6ba7b810-...", "languageCode": "nl-NL", "label": "Nederlands" },
    { "id": "7c9e6679-...", "languageCode": "fr-FR", "label": "Français" },
    { "id": "f47ac10b-...", "languageCode": "de-DE", "label": "Deutsch" }
  ]
}
```

---

## Common Mistakes

### 1. Forgetting the `*` Marker

```eligian
❌ languages {
  "en-US" "English"
  "nl-NL" "Nederlands"  // Forgot * marker
}

✅ languages {
  * "en-US" "English"
  "nl-NL" "Nederlands"
}
```

### 2. Wrong Language Code Format

```eligian
❌ languages {
  "EN-US" "English"  // Uppercase primary
}

✅ languages {
  "en-US" "English"
}
```

### 3. Languages Block Not First

```eligian
❌ layout "./index.html"
   languages { "en-US" "English" }  // Must be first

✅ languages { "en-US" "English" }
   layout "./index.html"
```

---

## Next Steps

- See [data-model.md](./data-model.md) for AST structure details
- See [spec.md](./spec.md) for complete feature specification
- See [contracts/](./contracts/) for TypeScript interfaces
