# Data Model: Languages Declaration Syntax

**Feature**: 037-languages-syntax
**Date**: 2025-11-23

## Overview

This document defines the AST entities, their properties, relationships, and transformation contracts for the languages declaration syntax.

---

## Entities

### 1. LanguagesBlock

**Purpose**: Represents the entire `languages { ... }` declaration at the top of an Eligian file.

**AST Properties**:
```typescript
interface LanguagesBlock extends AstNode {
  $type: 'LanguagesBlock';
  entries: LanguageEntry[];      // Array of language declarations (1+)
  $cstNode?: CstNode;            // Concrete syntax tree node for source location
  $container?: Program;          // Parent Program node
}
```

**Relationships**:
- **Parent**: `Program` (must be first child in `Program.languages` property)
- **Children**: Array of `LanguageEntry` nodes (1 or more entries required)

**Validation Rules**:
1. **FR-012**: Must contain at least 1 entry
   - Error: "Languages block cannot be empty"
2. **FR-004**: Must be first declaration if present (enforced by grammar)
   - Parse error if placed after other declarations
3. **FR-011**: Only one languages block allowed per Program
   - Error: "Only one languages block allowed per file"

**State**: Compile-time only (no runtime state)

**Grammar Definition**:
```langium
LanguagesBlock:
  'languages' '{'
    entries+=LanguageEntry+
  '}';
```

---

### 2. LanguageEntry

**Purpose**: Represents a single language declaration within the languages block.

**AST Properties**:
```typescript
interface LanguageEntry extends AstNode {
  $type: 'LanguageEntry';
  isDefault: boolean;            // true if * marker present
  code: string;                  // Language code (e.g., "en-US")
  label: string;                 // Display label (e.g., "English")
  $cstNode?: CstNode;            // Source location for errors
  $container?: LanguagesBlock;   // Parent LanguagesBlock
}
```

**Relationships**:
- **Parent**: `LanguagesBlock` (contained in `LanguagesBlock.entries` array)
- **Children**: None (leaf node)

**Validation Rules**:
1. **FR-005**: Code must match IETF format
   - Pattern: `/^[a-z]{2,3}-[A-Z]{2,3}$/`
   - Error: "Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')"
   - Examples: ✅ `en-US`, `nl-NL`, `fr-FR` | ❌ `EN-US`, `en-us`, `english`

2. **FR-006**: No duplicate codes within same LanguagesBlock
   - Error: "Duplicate language code: '{code}'"

3. **FR-003**: Exactly one `isDefault: true` when multiple entries (≥2)
   - Error (zero defaults): "Multiple languages require exactly one * marker to indicate the default"
   - Error (multiple defaults): "Only one language can be marked as default"

4. **FR-002**: Zero `isDefault: true` markers allowed when single entry (auto-default)
   - Single entry implicitly becomes default (no `*` needed)

**Grammar Definition**:
```langium
LanguageEntry:
  isDefault?='*'? code=STRING label=STRING;
```

---

## Transformation Contracts

### Input: LanguagesBlock AST

```typescript
LanguagesBlock {
  entries: [
    { isDefault: true, code: "en-US", label: "English" },
    { isDefault: false, code: "nl-NL", label: "Nederlands" },
    { isDefault: false, code: "fr-FR", label: "Français" }
  ]
}
```

### Output: Eligius Configuration Properties

```typescript
{
  language: "en-US",  // From entry with isDefault: true
  availableLanguages: [
    { id: "550e8400-...", languageCode: "en-US", label: "English" },
    { id: "6ba7b810-...", languageCode: "nl-NL", label: "Nederlands" },
    { id: "7c9e6679-...", languageCode: "fr-FR", label: "Français" }
  ]
}
```

### Transformation Rules

1. **Default Language Selection**:
   - Multiple entries: Select entry where `isDefault === true`
   - Single entry: Select the only entry (implicit default)
   - Assign `entry.code` to `config.language`

2. **availableLanguages Array**:
   - Map each `LanguageEntry` to `ILabel` object:
     ```typescript
     {
       id: crypto.randomUUID(),           // Generate UUID v4
       languageCode: entry.code,          // From AST
       label: entry.label                 // From AST
     }
     ```

3. **Absent LanguagesBlock** (backward compatibility):
   - `config.language = "en-US"`
   - `config.availableLanguages = [{ id: crypto.randomUUID(), languageCode: "en-US", label: "English" }]`

---

## Typir Type Representation

### LanguagesType

**Purpose**: Provides type information for IDE hover support and compile-time validation.

**Properties**:
```typescript
interface LanguagesTypeProperties {
  languageCount: number;      // Total number of languages
  defaultLanguage: string;    // Default language code
  allLanguages: string[];     // All language codes
}
```

**Type Name** (hover display):
- Multiple: `"Languages: 3 languages, default: en-US"`
- Single: `"Languages: 1 language, default: en-US"`

**Type Identifier** (caching):
- Format: `"Languages:{count}:{defaultLanguage}"`
- Example: `"Languages:3:en-US"`

**Inference**:
```typescript
LanguagesBlock {
  entries: [
    { isDefault: true, code: "en-US", label: "English" },
    { isDefault: false, code: "nl-NL", label: "Nederlands" }
  ]
}
↓
LanguagesType {
  languageCount: 2,
  defaultLanguage: "en-US",
  allLanguages: ["en-US", "nl-NL"]
}
```

---

## Examples

### Example 1: Single Language (Implicit Default)

**DSL**:
```eligian
languages {
  "en-US" "English"
}
```

**AST**:
```typescript
LanguagesBlock {
  entries: [
    { isDefault: false, code: "en-US", label: "English" }
  ]
}
```

**Output**:
```json
{
  "language": "en-US",
  "availableLanguages": [
    { "id": "550e8400-...", "languageCode": "en-US", "label": "English" }
  ]
}
```

---

### Example 2: Multiple Languages (Explicit Default)

**DSL**:
```eligian
languages {
  * "nl-NL" "Nederlands"
    "en-US" "English"
    "fr-FR" "Français"
}
```

**AST**:
```typescript
LanguagesBlock {
  entries: [
    { isDefault: true, code: "nl-NL", label: "Nederlands" },
    { isDefault: false, code: "en-US", label: "English" },
    { isDefault: false, code: "fr-FR", label: "Français" }
  ]
}
```

**Output**:
```json
{
  "language": "nl-NL",
  "availableLanguages": [
    { "id": "550e8400-...", "languageCode": "nl-NL", "label": "Nederlands" },
    { "id": "6ba7b810-...", "languageCode": "en-US", "label": "English" },
    { "id": "7c9e6679-...", "languageCode": "fr-FR", "label": "Français" }
  ]
}
```

---

### Example 3: No LanguagesBlock (Backward Compatible)

**DSL**:
```eligian
// No languages block
timeline "Demo" in "#container" using raf {
  at 0s..5s selectElement("#box") {
    animate({opacity: 1}, 1000)
  }
}
```

**AST**:
```typescript
Program {
  languages: undefined,
  statements: [ /* ... */ ]
}
```

**Output**:
```json
{
  "language": "en-US",
  "availableLanguages": [
    { "id": "550e8400-...", "languageCode": "en-US", "label": "English" }
  ]
}
```

---

## Validation Error Examples

### Error 1: Invalid Language Code Format

**DSL**:
```eligian
languages {
  "EN-US" "English"  // ❌ Uppercase primary language
}
```

**Error**:
```
Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')
  at LanguageEntry (line 2, column 3)
```

---

### Error 2: Duplicate Language Code

**DSL**:
```eligian
languages {
  "en-US" "English"
  "en-US" "American English"  // ❌ Duplicate
}
```

**Error**:
```
Duplicate language code: 'en-US'
  at LanguageEntry (line 3, column 3)
```

---

### Error 3: Missing Default Marker (Multiple Languages)

**DSL**:
```eligian
languages {
  "en-US" "English"
  "nl-NL" "Nederlands"  // ❌ No * marker on either language
}
```

**Error**:
```
Multiple languages require exactly one * marker to indicate the default
  at LanguagesBlock (line 1, column 1)
```

---

### Error 4: Multiple Default Markers

**DSL**:
```eligian
languages {
  * "en-US" "English"
  * "nl-NL" "Nederlands"  // ❌ Two * markers
}
```

**Error**:
```
Only one language can be marked as default
  at LanguagesBlock (line 1, column 1)
```

---

## Summary

**Entities**: 2 (LanguagesBlock, LanguageEntry)
**Validation Rules**: 7 total (4 on LanguageEntry, 3 on LanguagesBlock)
**Transformation**: AST → Eligius `language` (string) + `availableLanguages` (ILabel[])
**Typir Integration**: LanguagesType with languageCount, defaultLanguage, allLanguages properties
