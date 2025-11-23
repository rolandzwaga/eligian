# Research: Languages Declaration Syntax

**Feature**: 037-languages-syntax
**Date**: 2025-11-23
**Status**: Complete

## Overview

This document contains research findings for implementing the languages declaration syntax in the Eligian DSL. All research questions from the implementation plan have been resolved.

---

## RT-001: Langium Grammar First Declaration Enforcement

**Decision**: Use **grammar-level enforcement** with `LanguagesBlock?` as the first optional element in the Program rule.

**Rationale**:
1. The existing grammar already follows this pattern for other declarations (see line 66-73 in `eligian.langium`)
2. Current `Program` rule uses a simple `(statements += ProgramStatement)*` pattern that treats all statements equally
3. Grammar-level enforcement provides clearer error messages at parse time rather than validation time
4. Langium's parser will naturally enforce ordering if we structure it as: `languages=LanguagesBlock? (statements+=ProgramStatement)*`

**Alternatives Considered**:
- **Validator check on AST positions**: This would require checking the position of LanguagesBlock after parsing completes. Rejected because:
  - More complex implementation (need to track statement order)
  - Error messages would appear after successful parsing (confusing UX)
  - Doesn't leverage Langium's built-in parser capabilities

**Implementation Notes**:
```langium
// Current (lines 66-67):
Program:
    (statements += ProgramStatement)*;

// Proposed:
Program:
    languages=LanguagesBlock?
    (statements += ProgramStatement)*;
```

**File Location**: `packages/language/src/eligian.langium` (lines 66-67)

**Example Pattern**: See `Library` rule (line 59-60) which already uses this pattern: `'library' name=ID (imports += LibraryImport)* (actions += ActionDefinition)*`

---

## RT-002: IETF Language Code Validation

**Decision**: Use **format validation only** with the regex pattern `^[a-z]{2,3}-[A-Z]{2,3}$` matching the existing labels schema.

**Rationale**:
1. The `TLanguageCode` type in Eligius is defined as: `type TLanguageCode = \`${Lowercase<string>}-${Uppercase<string>}\`` (line 130 in `F:\projects\eligius\eligius\src\types.ts`)
2. The existing labels schema already validates this format with pattern `^[a-z]{2,3}-[A-Z]{2,3}$` (line 30 in `packages/language/src/schemas/labels-schema.json`)
3. This matches IETF BCP 47 format: lowercase primary language subtag, hyphen, uppercase region subtag
4. TypeScript's template literal type ensures compile-time format checking

**Alternatives Considered**:
- **Real IETF tag validation**: Validate against the official IANA Language Subtag Registry. Rejected because:
  - Requires maintaining/bundling a large database of valid tags
  - Adds significant complexity and bundle size
  - Eligius type system doesn't enforce "real" tags, only format
  - Users may want custom/fictional language codes for demos

**Implementation Notes**:
- Validator regex: `/^[a-z]{2,3}-[A-Z]{2,3}$/`
- Error message: "Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')"
- Examples of valid codes: `en-US`, `nl-NL`, `fr-FR`, `de-DE`, `pt-BR`
- Examples of invalid codes: `EN-US` (uppercase primary), `en-us` (lowercase region), `english` (no region), `en_US` (underscore instead of hyphen)

**Reference Files**:
- `F:\projects\eligius\eligius\src\types.ts` (line 130)
- `packages/language/src/schemas/labels-schema.json` (line 30)

---

## RT-003: Typir LanguagesType Design

**Decision**: Create a **LanguagesType** using Typir's `CustomKind` factory following the established pattern from Feature 021.

**Type Properties**:
```typescript
interface LanguagesTypeProperties {
  languageCount: number;      // Total number of languages in the block
  defaultLanguage: string;    // Language code of the default language
  allLanguages: string[];     // Array of all language codes in the block
}
```

**Type Name Format**: `"Languages: {count} languages, default: {code}"`
- Example: `"Languages: 3 languages, default: en-US"`
- Single language: `"Languages: 1 language, default: en-US"`

**Rationale**: This approach is based on three established patterns from Feature 021:

1. **ImportType Pattern**: Uses CustomKind factory with `calculateTypeName` and `calculateTypeIdentifier`
2. **TimelineEventType Pattern**: Type name includes multiple pieces of information in hover tooltip
3. **LabelIDType Pattern**: Properties include count and array of items for validation

**Alternatives Considered**:
- **Simple Type with Count Only**: Rejected - doesn't provide enough information for hover tooltips
- **Rich Type with Full Entry Objects**: Rejected - violates Typir CustomTypeProperties constraint (can't have complex nested objects)
- **Type Per Language Entry**: Rejected - doesn't match the DSL structure (languages block is the primary concept)

**Implementation Notes**:

File structure:
```
packages/language/src/type-system-typir/
├── types/languages-type.ts              # CustomKind factory
├── inference/languages-inference.ts     # Type inference from LanguagesBlock AST
└── validation/languages-validation.ts   # Validation rules
```

Factory pattern:
```typescript
export function createLanguagesTypeFactory(
  typir: TypirLangiumServices<EligianSpecifics>
): CustomKind<LanguagesTypeProperties, EligianSpecifics> {
  return new CustomKind<LanguagesTypeProperties, EligianSpecifics>(typir, {
    name: 'Languages',
    calculateTypeName: (props) => {
      const langWord = props.languageCount === 1 ? 'language' : 'languages';
      return `Languages: ${props.languageCount} ${langWord}, default: ${props.defaultLanguage}`;
    },
    calculateTypeIdentifier: (props) => {
      return `Languages:${props.languageCount}:${props.defaultLanguage}`;
    },
  });
}
```

**Reference Files**:
- `packages/language/src/type-system-typir/types/import-type.ts`
- `packages/language/src/type-system-typir/types/timeline-event-type.ts`
- `packages/language/src/type-system-typir/types/label-id-type.ts`

---

## RT-004: ILabel ID Generation

**Decision**: Generate UUID v4 using `crypto.randomUUID()` for each `ILabel` entry in `availableLanguages`.

**Rationale**:
1. Eligius `ILabel` interface requires `id` property (lines 102-111 in `F:\projects\eligius\eligius\src\types.ts`)
2. Project constitution (Principle VII) mandates UUID v4 for all entity IDs to ensure global uniqueness
3. Current transformer already uses this pattern for `availableLanguages` default (line 453 in `ast-transformer.ts`)
4. Consistent with how other entities (actions, operations, timelines) generate IDs

**Alternatives Considered**:
- **Sequential integers**: Rejected - not globally unique, violates Constitution Principle VII
- **Hash of languageCode**: Rejected - complexity without benefit, UUIDs are the established pattern

**Implementation Notes**:
```typescript
// For each language in LanguagesBlock, generate:
{
  id: crypto.randomUUID(),
  languageCode: 'en-US', // From DSL
  label: 'English'       // From DSL
}
```

**Example Transformation**:
```eligian
languages {
  "en-US" "English"
  "nl-NL" "Nederlands"
  "fr-FR" "Français"
}
```

Transforms to:
```json
{
  "language": "en-US",
  "availableLanguages": [
    { "id": "550e8400-e29b-41d4-a716-446655440000", "languageCode": "en-US", "label": "English" },
    { "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8", "languageCode": "nl-NL", "label": "Nederlands" },
    { "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "languageCode": "fr-FR", "label": "Français" }
  ]
}
```

**Reference Files**:
- `F:\projects\eligius\eligius\src\types.ts` (lines 102-111)
- `packages/language/src/compiler/ast-transformer.ts` (lines 452-454)

---

## RT-005: Default Language Behavior

**Decision**: When `LanguagesBlock` is absent, use existing hardcoded defaults (`en-US`). When present, the first declared language (or the one marked with `*`) becomes the default.

**Rationale**:
1. Current defaults in `createDefaultConfiguration()`:
   - `language: 'en-US'`
   - `availableLanguages: [{ id: crypto.randomUUID(), languageCode: 'en-US', label: 'English' }]`
2. These defaults are appropriate fallbacks when user doesn't specify languages
3. When user explicitly declares languages, respecting their choice is critical
4. For single language: first declared is implicitly default (no `*` needed)
5. For multiple languages: `*` marker explicitly indicates default

**Alternatives Considered**:
- **Always require explicit default**: Rejected - more verbose, violates DSL design goal of conciseness
- **Keep 'en-US' even when languages specified**: Rejected - doesn't respect user's language declarations

**Implementation Cases**:

**Case 1: No LanguagesBlock (backward compatible)**
```eligian
// No languages block
timeline "Demo" in "#container" using raf { ... }
```
Generates:
```json
{
  "language": "en-US",
  "availableLanguages": [
    { "id": "...", "languageCode": "en-US", "label": "English" }
  ]
}
```

**Case 2: Single Language (implicit default)**
```eligian
languages {
  "fr-FR" "Français"
}
```
Generates:
```json
{
  "language": "fr-FR",
  "availableLanguages": [
    { "id": "...", "languageCode": "fr-FR", "label": "Français" }
  ]
}
```

**Case 3: Multiple Languages (explicit default with `*`)**
```eligian
languages {
  * "fr-FR" "Français"
    "en-US" "English"
    "de-DE" "Deutsch"
}
```
Generates:
```json
{
  "language": "fr-FR",
  "availableLanguages": [
    { "id": "...", "languageCode": "fr-FR", "label": "Français" },
    { "id": "...", "languageCode": "en-US", "label": "English" },
    { "id": "...", "languageCode": "de-DE", "label": "Deutsch" }
  ]
}
```

**Transformer Logic**:
```typescript
// In transformAST function:
const defaults = createDefaultConfiguration();

// If LanguagesBlock present, override defaults:
if (program.languages) {
  const entries = program.languages.entries;

  // Find default: entry with isDefault=true, or first entry if single language
  const defaultEntry = entries.find(e => e.isDefault) || entries[0];
  defaults.language = defaultEntry.code;

  // Transform all languages to availableLanguages array
  defaults.availableLanguages = entries.map(entry => ({
    id: crypto.randomUUID(),
    languageCode: entry.code,
    label: entry.label
  }));
}
```

**Reference Files**:
- `packages/language/src/compiler/ast-transformer.ts` (lines 440-457)

---

## Summary

All research questions have been resolved:

| ID | Topic | Decision |
|----|-------|----------|
| RT-001 | Grammar Enforcement | Grammar-level with `languages=LanguagesBlock?` at start of Program |
| RT-002 | Language Code Validation | Format validation with regex `^[a-z]{2,3}-[A-Z]{2,3}$` |
| RT-003 | Typir Type Design | CustomKind factory with languageCount, defaultLanguage, allLanguages properties |
| RT-004 | ILabel ID Generation | UUID v4 using `crypto.randomUUID()` |
| RT-005 | Default Language | First declared or `*` marked when present, `en-US` when absent |

**Next Phase**: Design & Contracts (data-model.md, contracts/, quickstart.md)
