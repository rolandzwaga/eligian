# Eligian Language Specification

**Version**: 1.8.0
**Last Updated**: 2026-10-31
**Status**: Living Document - Updated with every language feature change

**Recent Changes** (v1.8.0):
- Timeline header options `using scroll "<selector>"`, `loop` and `duration <time>` (Feature 049, section 6.1)
- `at <start> for <duration>` and optional end blocks for inline timeline and stagger blocks
  (Feature 048, sections 6.2 and 6.3)
- Operation-data dependencies use inferred action contracts (Feature 047, section 4.7): a called
  action may rely on its caller's operation data; missing properties are reported where the
  action is entered (timelines, event actions, controller action lists)
- Runtime string concatenation (Feature 046, section 7.4): `"#" + slideId` in operation and action
  call arguments and action-level consts compiles to Eligius's `concatenateStrings`
- Runtime values (parameters, variables, system properties, property chains) passed to an
  operation that does not resolve property chains itself are resolved before it runs; they used
  to arrive as the literal chain text (e.g. `setElementContent(label)` showed `$operationdata.label`)

**Previous Changes** (v1.7.0):
- `labels` import replaced by `locales` import (Feature 045); the `labels` keyword no longer exists
- Locales JSON uses the Eligius 2.2 nested format keyed by locale code; compiles to `config.locales`
- Locales import requires a `languages` block
- Translation keys are referenced in dot-notation via `LabelController`
- Event names MUST be one of the 43 Eligius events (Feature 029); custom names are compile errors
- Event argument types map to DSL annotations (`TLanguageCode` → `string`, `T[]` → `array`); `any` and callback arguments cannot be annotated
- Duplicate event handlers are warnings, not errors; the compiler treats every diagnostic as fatal
- Corrected the valid event list in section 5.10 (previous list contained non-existent events)

**Previous Changes** (v1.6.0):
- Added languages declaration syntax (Feature 037)
- Languages block declares available presentation languages and default language
- Single language: implicit default (no `*` marker required)
- Multiple languages: explicit default (exactly one `*` marker required)
- Language code validation: IETF BCP 47 format (xx-XX)
- Typir integration: hover tooltips show language count and default
- Must be first declaration in file when present
- Compiles to Eligius `language` and `availableLanguages` properties

**Previous Changes** (v1.5.2):
- Added labels import support (Feature 033)
- Labels import allows internationalization with multi-language JSON files
- Labels JSON validated against schema with compile-time error reporting
- Labels assigned to Eligius configuration's `labels` property

**Previous Changes** (v1.5.1):
- Added library cache invalidation documentation (Feature 032 improvements)
- Added parameter count validation for imported actions (Feature 032 fix)
- Updated CSS path resolution to be relative to source file directory (not workspace root)
- Added library file compilation prevention documentation
- Added nested library dependency documentation

**Previous Changes** (v1.5.0):
- Fixed event action syntax notation to avoid confusion with EBNF (Critical Issue #1)
- Updated keyword list to include all 11 missing keywords (Critical Issue #2)
- Added event name validation documentation (Feature 029)
- Added event action code completion documentation (Feature 030)
- Added CSS class and selector validation documentation (Feature 013)
- Added preview CSS support with hot-reload documentation (Feature 011)
- Expanded JSDoc documentation with auto-generation and hover features (Feature 020)
- Added Typir integration documentation (Feature 021)
- Expanded library file documentation with validation rules (Feature 023)
- Updated all code examples for accuracy
- Verified 1,758 tests passing, 81.72% coverage

**Previous Changes** (v1.4.0):
- Added event action support (Feature 028): event action definitions, event topic namespacing, runtime event handling
- Event actions can handle runtime events with optional topic namespacing
- Updated grammar summary to include EventActionDefinition
- Added event action examples and validation rules

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Lexical Structure](#2-lexical-structure)
3. [Program Structure](#3-program-structure)
   - 3.3 [Languages Declaration](#33-languages-declaration-feature-037)
4. [Actions](#4-actions)
5. [Event Actions](#5-event-actions)
   - 5.10 [Event Name Validation](#510-event-name-validation-feature-029)
   - 5.11 [IDE Support and Code Completion](#511-ide-support-and-code-completion-feature-030)
6. [Timelines](#6-timelines)
7. [Expressions](#7-expressions)
8. [Statements](#8-statements)
9. [Type System](#9-type-system)
10. [Scoping and References](#10-scoping-and-references)
11. [Compilation Model](#11-compilation-model)
12. [CSS Integration and Validation](#12-css-integration-and-validation-feature-013)
13. [VS Code Preview Integration](#13-vs-code-preview-integration-feature-011)

---

## 1. Introduction

### 1.1 Purpose

Eligian is a domain-specific language (DSL) for creating timeline-based interactive presentations using the Eligius Story Telling Engine. It provides a concise, declarative syntax that compiles to Eligius JSON configuration.

### 1.2 Design Goals

- **Concise**: 70-80% reduction in verbosity compared to raw JSON
- **Type-safe**: Compile-time type checking with optional annotations
- **Timeline-first**: Syntax optimized for timeline-based thinking
- **Familiar**: Borrows conventions from JavaScript/TypeScript
- **IDE-friendly**: Full autocomplete and validation support

### 1.3 File Extension

Eligian source files use the `.eligian` extension.

---

## 2. Lexical Structure

### 2.1 Comments

**Single-line comments**:
```eligian
// Single-line comment
```

**Multi-line comments**:
```eligian
/* Multi-line
   comment */
```

**JSDoc documentation comments**:
```eligian
/**
 * Documentation comment for custom actions
 * @param paramName Description of the parameter
 */
```

JSDoc-style comments (`/** */`) are recognized as documentation comments when placed directly above action definitions. They support:
- Main description text (before any `@tag`)
- `@param` tags with optional type and description: `@param {type} name description`
- Markdown formatting in descriptions

See [Section 4.4 Action Documentation](#44-action-documentation) for details.

### 2.2 Identifiers

Identifiers start with a letter or underscore, followed by letters, digits, or underscores:

```
ID := [_a-zA-Z][\w_]*
```

**Examples**: `fadeIn`, `_private`, `myAction2`, `VIDEO_TIMELINE`

### 2.3 Literals

#### String Literals

```eligian
"double quoted string"
'single quoted string'
"escaped quote: \"hello\""
```

#### Number Literals

```eligian
42          // Integer
3.14        // Decimal
0.5         // Decimal starting with zero
```

**Note**: Numbers are always parsed as JavaScript `number` type (IEEE 754 double-precision).

#### Boolean Literals

```eligian
true
false
```

#### Null Literal

```eligian
null
```

### 2.4 Keywords

Keywords of the language:

```
action      at          timeline    for         if
else        break       continue    from        as
import      layout      styles      provider    locales
true        false       on          event       topic
endable     library     private     sequence    stagger
in          using       with        const       null
```

**Reserved keywords** cannot be used as names: `action`, `break`, `const`, `continue`, `else`,
`endable`, `false`, `for`, `if`, `import`, `null`, `on`, `sequence`, `stagger`, `timeline`, `true`.

All other keywords are **contextual**: they only have meaning in one fixed position, so they are
valid parameter, `const`, `for`-item and named-import names (`action f(event)`, `const s = 5`,
`for (from in items)`, `import video from './intro.mp4'`). This includes the type names
(`string`, `number`, ...), asset types, timeline providers, scope names and the time units
`ms`, `s`, `m`, `h`. Object-literal keys and property-chain segments accept **every** keyword
(`{ from: 0, if: 1 }`, `$operationdata.html`, `@@currentItem.for`).

**Note**: Keywords are organized by category:
- **Action keywords**: `action`, `endable`, `private`
- **Control flow**: `for`, `if`, `else`, `break`, `continue`, `in`
- **Timeline keywords**: `timeline`, `at`, `sequence`, `stagger`, `using`, `with`, `enter`, `leave` (`on enter` / `on leave`)
- **Import keywords**: `import`, `layout`, `styles`, `provider`, `locales`, `library`, `from`, `as`
- **Event keywords**: `on`, `event`, `topic`
- **Declaration keywords**: `const`
- **Literals**: `true`, `false`, `null`

### 2.5 Time Units

```eligian
ms          // Milliseconds
s           // Seconds
m           // Minutes
h           // Hours
```

**Default**: If no unit is specified, the value is in seconds (`42` = `42s`). This is also what
makes `2s * 3` six seconds: a unitless number in time arithmetic is a plain factor.

---

## 3. Program Structure

### 3.1 File Types

Eligian supports two types of source files:

1. **Program Files** - Complete applications with timelines and resources
2. **Library Files** - Reusable action collections (Feature 023)

#### 3.1.1 Program Files

An Eligian program consists of an optional languages declaration followed by zero or more program statements:

```eligian
Program := LanguagesBlock? ProgramStatement*

ProgramStatement := ImportStatement | ProgramElement

ProgramElement := ActionDefinition | Timeline | VariableDeclaration

ImportStatement := DefaultImport | NamedImport | LibraryImport

LanguagesBlock := 'languages' '{' LanguageEntry+ '}'

LanguageEntry := '*'? STRING STRING
```

**Key Points**:
- **Languages Declaration**: Optional, but if present must be the FIRST declaration (Feature 037)
- **Flexible Ordering**: After languages, imports, constants, actions, and timelines can appear in any order
- **No Strict Grouping**: You can mix imports with other declarations as needed
- **Can import from libraries**: Programs can import actions from library files

**Example**:

```eligian
// Languages declaration (MUST be first if present)
languages {
  * "en-US" "English"
    "nl-NL" "Nederlands"
}

// Import action from library
import { fadeIn } from "./animations.eligian"

// Import assets
layout "./layout.html"
import header from "./header.html"

// Global variable
const duration = 1000

// Another import - flexible ordering
styles "./styles.css"
import customStyles from "./custom-styles.css"

// Local action definition
action customAnimation(selector: string) [
  selectElement(selector)
  animate({opacity: 1}, @duration)
]

// Timeline
timeline "main" in "#app" using raf {
  at 0s..2s fadeIn("#title")
  at 2s..4s customAnimation("#content")
}
```

#### 3.1.2 Library Files

Library files contain reusable action definitions that can be imported by programs:

```eligian
Library := 'library' ID ActionDefinition*
```

**Syntax**:
```eligian
library <libraryName>

[visibility] action <actionName>(<parameters>) [
  // Action body
]
```

**Key Points**:
- **Must start with `library` keyword**: Identifies file as a library
- **Contains only actions**: No timelines, imports, or constants allowed
- **Visibility modifiers**: Actions can be `private` (internal only) or public (default)
- **File extension**: Library files use the `.eligian` extension like programs

**Example**:

```eligian
library animations

/**
 * Fades in an element over a specified duration
 * @param selector CSS selector for target element
 * @param duration Animation duration in milliseconds
 */
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

/**
 * Internal helper for resetting opacity
 */
private action resetOpacity(selector: string) [
  selectElement(selector)
  animate({opacity: 0}, 0)
]

action fadeOut(selector: string, duration: number) [
  resetOpacity(selector)  // Private actions accessible within library
  animate({opacity: 0}, duration)
]
```

**Library Restrictions**:
- ❌ Cannot contain timeline definitions
- ❌ Cannot contain import statements (assets or other libraries)
- ❌ Cannot contain constant declarations
- ✅ Can contain regular and endable actions
- ✅ Can use `private` visibility modifier
- ✅ Private actions can call other actions within same library

### 3.2 Import Statements

Eligian supports three types of import statements for referencing external assets:

1. **DefaultImport** - Auto-assignment to configuration properties
2. **NamedImport** - Reusable asset references with identifiers
3. **LibraryImport** - Import actions from library files (see section 3.3)

#### 3.2.1 Default Import Syntax

Default imports automatically assign assets to specific configuration properties without requiring a name.

**Syntax**:
```eligian
layout "<path>"
styles "<path>"
provider "<path>"
locales "<path>"
```

**Import Types**:
- `layout` - HTML layout file (auto-assigned to `layoutTemplate`)
- `styles` - CSS stylesheet file (registered for CSS validation/completion)
- `provider` - Media file (auto-assigned to timeline provider source)
- `locales` - Locales JSON file (auto-assigned to `locales` property, validated against schema; requires a `languages` block)

**Examples**:

```eligian
// Default imports - no 'import' or 'from' keywords
layout "./layout.html"      // Assigns to layoutTemplate property
styles "./main.css"         // Registers CSS for completions
provider "./video.mp4"      // Assigns to timelineProvider.source
locales "./locales.json"    // Assigns to locales property (internationalization)
```

**Restrictions**:
- Only ONE of each type allowed per document
- Type is inferred from file extension
- Path must be relative

#### 3.2.2 Named Import Syntax

Named imports create reusable asset references with explicit identifiers.

**Syntax**:
```eligian
import <name> from "<path>"
import <name> from "<path>" as <type>
```

**Import Types**:
- `html` - HTML content files
- `css` - CSS stylesheet files
- `media` - Media files (images, audio, video)

**Type Inference**: The compiler automatically infers the import type from file extensions:
- `.html`, `.htm` → `html`
- `.css` → `css`
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.svg`, `.webp`, `.mp3`, `.wav`, `.ogg`, `.mp4`, `.webm`, `.ogv` → `media`

**Examples**:

```eligian
// Type inferred from extension
import tooltip from "./tooltip.html"       // Inferred as 'html'
import theme from "./theme.css"            // Inferred as 'css'
import logo from "./logo.png"              // Inferred as 'media'

// Explicit type override (for unknown extensions)
import template from "./template.tpl" as html
import custom from "./custom.unknown" as media
```

**Restrictions**:
- Name must be unique within document
- Names cannot be reserved keywords

#### 3.2.3 Path Validation

Import paths must be **relative paths** only:

✅ **Valid**:
- `"./file.html"` - Same directory
- `"../parent/file.css"` - Parent directory
- `"./nested/deep/file.png"` - Nested directories

❌ **Invalid**:
- `"/absolute/path.html"` - Absolute Unix path
- `"C:\absolute\path.css"` - Absolute Windows path
- `"https://example.com/file.js"` - URL path

**Reserved Names**: Import names cannot be reserved keywords (`action`, `timeline`, `const`, `for`, `if`, etc.)

#### 3.2.4 Locales Import (Feature 045)

Locales imports provide internationalization support by loading translations from a JSON file. This replaces the earlier `labels` import (Feature 033): the `labels` keyword no longer exists and the old array-of-label-groups file format is rejected.

**Syntax**:
```eligian
locales "<path-to-json-file>"
```

**Purpose**: Import translations for every declared language. The JSON is validated against a schema and assigned to the Eligius configuration's `locales` property (`ILocalesConfiguration`, Eligius 2.2+).

**Prerequisite**: A `languages` block (section 3.3 Languages Declaration) must be present. Importing locales without one is an error.

**JSON Format**: An object keyed by locale code (`xx-XX`). Each value is a nested object of translation keys whose leaves are strings. Nested objects form dot-notation keys (`nav.home`). A locale value may instead be `{ "$ref": "./other.json" }` to load that locale from another file.

**Example Locales File** (`locales.json`):
```json
{
  "en-US": {
    "welcome": { "title": "Welcome" },
    "nav": { "home": "Home", "about": "About" }
  },
  "nl-NL": {
    "welcome": { "title": "Welkom" },
    "nav": { "home": "Thuis", "about": "Over" }
  }
}
```

**Example Usage**:
```eligian
languages {
  * "en-US" "English"
    "nl-NL" "Nederlands"
}

locales "./locales.json"
layout "./layout.html"
styles "./styles.css"

timeline "Multi-Language Demo" in "#app" using raf {
  at 0s..5s [
    selectElement("#title")
    // LabelController renders the translation for the active language
    addController("LabelController", "welcome.title")
  ] []
}
```

**Translation Keys**: The second argument of `addController("LabelController", ...)` is validated against the imported keys, with code completion and "Did you mean?" suggestions (section 5.12).

**Schema Validation**: The compiler validates the file against `packages/language/src/schemas/locales-schema.json` (Draft 2020-12):
- Root must be an object with at least one locale
- Locale codes must match `^[a-z]{2,3}-[A-Z]{2,3}$` (e.g. `en-US`)
- Values are nested objects whose leaves are strings, or a `$ref` object

**Validation Errors**:
```eligian
locales "./locales.json"
// ❌ ERROR: Locales import requires a languages block to declare available languages.

locales "./array-format.json"
// ❌ ERROR: Property "root" must be a object. See schema documentation for required fields and types

locales "./bad-code.json"
// ❌ ERROR: Invalid locale code "en". Use format like "en-US" or "nl-NL"

locales "./missing.json"
// ❌ ERROR: Locales file not found: ./missing.json
```

**Restrictions**:
- Only ONE locales import allowed per program
- Path must be relative (not absolute)
- Requires a `languages` block

**Compilation**: The file content is assigned verbatim to `config.locales` in the compiled Eligius configuration.

### 3.3 Library Import Statements (Feature 023)

Library import statements allow you to import reusable actions from library files.

**Syntax**:
```eligian
import { <action1>, <action2>, ... } from "<library-path>"
import { <action> as <alias> } from "<library-path>"
```

**Key Points**:
- **Curly braces required**: Even for single action imports
- **File extension required**: Must include `.eligian` extension
- **Relative paths only**: Same path restrictions as asset imports
- **Only public actions**: Private actions cannot be imported

#### 3.3.1 Single Action Import

```eligian
import { fadeIn } from "./animations.eligian"

timeline "Demo" at 0s {
  at 0s fadeIn("#box", 1000)
}
```

#### 3.3.2 Multiple Action Imports

```eligian
import { fadeIn, fadeOut, slideIn } from "./animations.eligian"

timeline "Demo" at 0s {
  at 0s fadeIn("#box", 1000)
  at 2s slideIn("#title", 800)
  at 5s fadeOut("#box", 500)
}
```

#### 3.3.3 Import with Aliases

Use aliases to resolve naming conflicts between imported actions or with local actions:

```eligian
// Resolve conflict between two libraries
import { fadeIn as animFadeIn } from "./animations.eligian"
import { fadeIn as transFadeIn } from "./transitions.eligian"

// Resolve conflict with local action
import { fadeIn as libFadeIn } from "./animations.eligian"

action fadeIn(selector: string) [
  // Local implementation
]

timeline "Demo" at 0s {
  at 0s animFadeIn("#box1", 1000)
  at 1s transFadeIn("#box2", 800)
  at 2s fadeIn("#box3", 500)       // Uses local action
  at 3s libFadeIn("#box4", 1000)   // Uses imported action
}
```

#### 3.3.4 Import from Multiple Libraries

```eligian
import { fadeIn, fadeOut } from "./animations.eligian"
import { debounce, throttle } from "./utils.eligian"
import { validateEmail } from "./validation.eligian"

// All imported actions available for use
timeline "Demo" at 0s {
  at 0s fadeIn("#form", 500)
  at 1s validateEmail("user@example.com")
  at 2s fadeOut("#form", 300)
}
```

#### 3.3.5 Nested Library Dependencies

Library files can import from other library files, enabling modular code organization:

```eligian
// File: easing.eligian
library easing

action easeIn(duration: number) [
  // Easing implementation
]

action easeOut(duration: number) [
  // Easing implementation
]
```

```eligian
// File: animations.eligian
library animations

import { easeIn, easeOut } from "./easing.eligian"

action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  easeIn(duration)
  animate({opacity: 1}, duration)
]

action fadeOut(selector: string, duration: number) [
  selectElement(selector)
  easeOut(duration)
  animate({opacity: 0}, duration)
]
```

```eligian
// File: main.eligian
import { fadeIn, fadeOut } from "./animations.eligian"

timeline "Demo" at 0s {
  at 0s..2s fadeIn("#box", 1000)
  at 2s..4s fadeOut("#box", 800)
}
```

**Key Points**:
- Libraries automatically load their dependencies recursively
- Circular dependencies are detected and produce compile errors
- Private actions in nested libraries cannot be imported (even transitively)
- All library documents are linked together during compilation for proper cross-references

**Circular Dependency Detection**:
```eligian
// File: A.eligian
library A
import { actionB } from "./B.eligian"
action actionA() [...]

// File: B.eligian
library B
import { actionA } from "./A.eligian"
action actionB() [...]

// ❌ ERROR: Circular dependency detected: A.eligian → B.eligian → A.eligian
```

#### 3.3.6 Library Cache Invalidation

When a library file is edited, the Langium workspace cache is automatically invalidated to ensure the latest version is compiled.

**Cache Behavior**:
- Library documents are cached in memory for performance
- On library file edit, cached document is deleted before re-parsing
- Next compilation reads fresh file content from disk
- Ensures changes to library files are immediately reflected in compilation

**Workflow**:
1. Edit library file (e.g., change parameter count in `fadeIn`)
2. Save library file
3. Compile main program that imports from library
4. ✅ Compilation uses **latest** library code (cache invalidated)
5. ❌ Without invalidation: would use **stale** cached version

This automatic cache invalidation is critical for proper development workflow with libraries.

#### 3.3.7 Validation Rules

**Parameter Count Validation**:
Imported actions validate argument counts at call sites:
```eligian
// animations.eligian
action fadeIn(selector: string, duration: number) [...]

// main.eligian
import { fadeIn } from "./animations.eligian"

timeline "test" at 0s {
  at 0s..2s fadeIn("#box")  // ❌ ERROR: Action 'fadeIn' expects 2 argument(s) but got 1
  at 2s..4s fadeIn("#box", 1000)  // ✅ Correct
}
```

**Library File Compilation Prevention**:
Library files cannot be compiled directly - they must be imported by a program:
```bash
# Trying to compile library file
eligian-cli animations.eligian

# ❌ ERROR: Cannot compile library files directly
# 💡 Library files must be imported by a main program. Create a .eligian file with an "import" statement to use this library.
```

**Private Action Import**:
```eligian
// lib.eligian
library lib
private action privateHelper() [...]

// main.eligian
import { privateHelper } from "./lib.eligian"
// ❌ ERROR: Cannot import private action 'privateHelper' from library
```

**Missing Library File**:
```eligian
import { fadeIn } from "./missing.eligian"
// ❌ ERROR: Library file not found: ./missing.eligian
```

**Action Not Found**:
```eligian
import { nonExistent } from "./animations.eligian"
// ❌ ERROR: Action 'nonExistent' not found in library './animations.eligian'
```

**Name Collision - Local Action**:
```eligian
import { fadeIn } from "./animations.eligian"
action fadeIn() [...]  // ❌ ERROR: Action 'fadeIn' already defined
```

**Name Collision - Built-in Operation**:
```eligian
// In library file
library bad
action selectElement() [...]
// ❌ ERROR: Action name 'selectElement' conflicts with built-in operation
```

**Alias Collision**:
```eligian
import { fadeIn as animate } from "./animations.eligian"
// ❌ ERROR: Alias 'animate' conflicts with built-in operation
```

### 3.4 Execution Model

1. **Imports** are resolved and assets are loaded
2. **Global variables** are evaluated and added to `$globaldata` scope
3. **Actions** are registered (not executed until called)
4. **Timelines** define event schedules (executed by Eligius runtime)

### 3.3 Languages Declaration (Feature 037)

The `languages` block declares the available presentation languages and default language for internationalization.

**Syntax**:
```eligian
languages {
  [*] "<languageCode>" "<displayLabel>"
  ...
}
```

**Grammar**:
```
LanguagesBlock := 'languages' '{' LanguageEntry+ '}'
LanguageEntry  := '*'? STRING STRING
```

**Key Rules**:
1. **First Declaration Only**: If present, the `languages` block MUST be the first declaration in the file
2. **Single Language**: No default marker (`*`) required - first (and only) language is implicitly default
3. **Multiple Languages**: Exactly one language MUST be marked with `*` as the default
4. **Language Code Format**: Must follow IETF BCP 47 format: `xx-XX` (e.g., `en-US`, `nl-NL`, `fr-FR`)
   - Primary language: lowercase (e.g., `en`, `nl`, `fr`)
   - Region code: uppercase (e.g., `US`, `NL`, `FR`)
5. **No Duplicates**: Each language code must be unique within the block

**Validation**:
- Invalid language code format → "Invalid language code format. Expected format: 'xx-XX' (e.g., 'en-US', 'nl-NL', 'fr-FR')"
- Missing default marker (multiple languages) → "Multiple languages declared but no default language marked with '*'"
- Multiple default markers → "Only one language can be marked as default with '*'"
- Duplicate language codes → "Duplicate language code: 'xx-XX'"
- Languages block not first → "languages block must be the first declaration"

**Compilation**:

The languages block compiles to Eligius configuration properties:
- `language: TLanguageCode` - The default language code
- `availableLanguages: ILabel[]` - Array of all available languages with UUIDs

```typescript
// Eligius types
type TLanguageCode = `${Lowercase<string>}-${Uppercase<string>}`;

interface ILabel {
  id: string;              // UUID v4
  languageCode: TLanguageCode;
  label: string;
}
```

**Examples**:

**Single Language (implicit default)**:
```eligian
// Most common use case - monolingual presentation
languages {
  "en-US" "English"
}

// Compiles to:
// {
//   "language": "en-US",
//   "availableLanguages": [
//     { "id": "<uuid>", "languageCode": "en-US", "label": "English" }
//   ]
// }
```

**Multiple Languages (explicit default)**:
```eligian
// Multilingual presentation with Dutch as default
languages {
  * "nl-NL" "Nederlands"
    "en-US" "English (US)"
    "en-GB" "English (UK)"
    "fr-FR" "Français"
    "de-DE" "Deutsch"
}

// Compiles to:
// {
//   "language": "nl-NL",
//   "availableLanguages": [
//     { "id": "<uuid>", "languageCode": "nl-NL", "label": "Nederlands" },
//     { "id": "<uuid>", "languageCode": "en-US", "label": "English (US)" },
//     { "id": "<uuid>", "languageCode": "en-GB", "label": "English (UK)" },
//     { "id": "<uuid>", "languageCode": "fr-FR", "label": "Français" },
//     { "id": "<uuid>", "languageCode": "de-DE", "label": "Deutsch" }
//   ]
// }
```

**IDE Support**:

- **Hover Tooltips**: Hovering over the `languages` keyword shows type information:
  - Single language: `"Languages: 1 language, default: en-US"`
  - Multiple languages: `"Languages: 5 languages, default: nl-NL"`
- **Code Completion**: Auto-complete for common language codes
- **Validation**: Real-time validation of language code format and default markers

**Backward Compatibility**:

If no `languages` block is present, the compiler defaults to:
```json
{
  "language": "en-US",
  "availableLanguages": [
    { "id": "<uuid>", "languageCode": "en-US", "label": "English" }
  ]
}
```

---

## 4. Actions

### 4.1 Regular Actions

Regular actions contain a sequence of operations:

```eligian
action <name> [
  <operation>*
]

action <name>(<parameters>) [
  <operation>*
]
```

**Example**:

```eligian
action showElement [
  selectElement("#box")
  addClass("visible")
]

action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

### 4.2 Endable Actions

Endable actions have separate start and end operation sequences:

```eligian
endable action <name> [
  <start-operations>*
] [
  <end-operations>*
]

endable action <name>(<parameters>) [
  <start-operations>*
] [
  <end-operations>*
]
```

**Example**:

```eligian
endable action showThenHide [
  selectElement(".overlay")
  addClass("visible")
] [
  removeClass("visible")
]
```

**Compilation**: Start operations execute at event start time, end operations at event end time.

### 4.3 Visibility Modifiers (Feature 023 - Library Files)

Actions in library files can have visibility modifiers to control whether they can be imported:

```eligian
[visibility] action <name>(<parameters>) [
  <operations>*
]

[visibility] endable action <name>(<parameters>) [
  <start-operations>*
] [
  <end-operations>*
]
```

#### 4.3.1 Public Actions (Default)

Actions without a visibility modifier are **public** and can be imported by other files:

```eligian
library animations

// Public action - can be imported
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**Usage**:
```eligian
import { fadeIn } from "./animations.eligian"  // ✅ OK
```

#### 4.3.2 Private Actions

Actions marked with `private` keyword are **private** and can only be used within the same library:

```eligian
library utils

// Private helper - internal only
private action validateSelector(selector: string) [
  // Validation logic
]

// Public action using private helper
action safeSelect(selector: string) [
  validateSelector(selector)  // ✅ OK - same library
  selectElement(selector)
]
```

**Import Restriction**:
```eligian
import { validateSelector } from "./utils.eligian"
// ❌ ERROR: Cannot import private action 'validateSelector' from library
```

**Key Points**:
- **Library-only**: `private` keyword can only be used in library files
- **Same-library access**: Private actions can call other actions in the same library
- **Not importable**: Private actions cannot be imported by other files
- **Encapsulation**: Use private actions to hide implementation details

**Error in Program File**:
```eligian
// main.eligian (program file)
private action myAction() [...]
// ❌ ERROR: Visibility modifier 'private' can only be used in library files
```

### 4.4 Parameters

#### Syntax

```eligian
Parameter := <name> | <name> : <type>
```

#### Parameter Types

- `string` - String literals, selectors
- `number` - Numeric values (durations, coordinates, etc.)
- `boolean` - Boolean values
- `object` - Object literals
- `array` - Array literals

**Example**:

```eligian
action animateElement(
  selector: string,
  duration: number,
  easing: string
) [
  selectElement(selector)
  animate({opacity: 1}, duration, easing)
]
```

#### Parameter Access

Inside action bodies, parameters are accessed directly by name:

```eligian
action demo(value: number) [
  // ✅ Correct - direct parameter reference
  wait(value)
]
```

**Note**: The compiler automatically expands direct parameter references to `$operationdata.<paramName>` in the compiled output. You should always use the direct syntax for cleaner, more readable code.

### 4.5 Action Documentation

Actions can be documented using JSDoc-style comments placed directly above the action definition:

```eligian
/**
 * Fades in an element over a specified duration with custom easing
 * @param selector CSS selector for the target element
 * @param duration Animation duration in milliseconds
 * @param easing Easing function name (e.g., "ease-in", "linear")
 */
action fadeIn(selector: string, duration: number, easing: string) [
  selectElement(selector)
  animate({opacity: 1}, duration, easing)
]
```

#### Syntax

**Structure**:
```eligian
/**
 * <description>
 * @param [<type>] <name> [<description>]
 * ...
 */
action <name>(<parameters>) [...]
```

**Components**:
- **Description**: Main documentation text (appears before any `@param` tags)
- **@param tags**: Document each parameter with optional type and description
  - Format: `@param {type} name description`
  - Type is optional: `@param name description`
  - Description is optional: `@param {type} name`
  - Minimal form: `@param name`

**Markdown Support**:
JSDoc descriptions support basic markdown:
- **Bold**: `**text**`
- *Italic*: `*text*`
- Code spans: `` `code` ``
- Links: `[text](url)`

#### Auto-Generation

The VS Code extension automatically generates JSDoc templates. Type `/**` on the line above an action and press Enter:

```eligian
// 1. Position cursor here and type /**
action fadeIn(selector: string, duration: number) [...]

// 2. After pressing Enter, template auto-generates:
/**
 * |  <-- cursor positioned here for description
 * @param {string} selector
 * @param {number} duration
 */
action fadeIn(selector: string, duration: number) [...]
```

**Features**:
- Automatically generates `@param` tag for each parameter in order
- Pre-fills type annotations from action signature
- Infers types for untyped parameters using the type system
- Places cursor at description line for immediate editing

#### Hover Documentation

When hovering over an action invocation, the IDE displays formatted documentation from the JSDoc comment:

```eligian
timeline "demo" in "#app" using raf {
  // Hovering over "fadeIn" shows tooltip:
  // ### fadeIn
  //
  // Fades in an element over a specified duration with custom easing
  //
  // **Parameters:**
  // - `selector` (`string`) - CSS selector for the target element
  // - `duration` (`number`) - Animation duration in milliseconds
  // - `easing` (`string`) - Easing function name (e.g., "ease-in", "linear")

  at 0s..5s fadeIn("#box", 1000, "ease-in")
}
```

**Graceful Degradation**:
- Actions without JSDoc show basic signature: `actionName(param1: type1, param2: type2)`
- Partial JSDoc (description only, no `@param` tags) displays available information
- Malformed JSDoc falls back to signature without errors

#### Best Practices

**1. Document public actions** (reused across files):
```eligian
/**
 * Shows an element with fade-in animation
 * @param selector Element to show
 * @param duration Animation length in ms
 */
action show(selector: string, duration: number) [...]
```

**2. Private/utility actions** (used once) may skip documentation:
```eligian
action _helperAction [...]  // No JSDoc needed for internal helpers
```

**3. Use markdown for clarity**:
```eligian
/**
 * Animates element with **custom timing**
 *
 * Use `"ease-in"` for gradual start, `"linear"` for constant speed
 * @param easing Timing function name
 */
```

**4. Document expected parameter values**:
```eligian
/**
 * @param direction One of: "left", "right", "up", "down"
 * @param speed Pixels per second (100-1000 recommended)
 */
```

### 4.6 Calling Actions

Actions use the **unified call syntax** - they're called exactly like built-in operations:

```eligian
// Define an action
action fadeIn(selector: string) [
  selectElement(selector)
  addClass("visible")
]

// Call it in a timeline - same syntax as operations
timeline "demo" in "#app" using raf {
  at 0s..5s fadeIn("#box")
  at 5s..10s selectElement("#other")  // Built-in operation - identical syntax
}
```

**Key Points**:
- Actions and operations use **identical calling syntax**
- The compiler automatically distinguishes between them by name resolution
- Action names **cannot** conflict with built-in operation names (compile error)
- This unified syntax works in all contexts: timeline events, control flow, sequence/stagger blocks
- **Imported actions** work identically to locally-defined actions (Feature 023)

**Name Collision Prevention**:

```eligian
// ❌ ERROR: Cannot define action with operation name
action selectElement() [  // Compile error: name conflicts with built-in operation
  ...
]

// ✅ OK: Custom name that doesn't conflict
action mySelectElement() [
  ...
]
```

**Using Imported Actions** (Feature 023):

Imported actions work identically to local actions:

```eligian
// Import from library
import { fadeIn, slideIn } from "./animations.eligian"

// Define local action
action customAnimation(selector: string) [
  selectElement(selector)
  addClass("animated")
]

timeline "demo" in "#app" using raf {
  at 0s..2s fadeIn("#title")           // Imported action
  at 2s..4s slideIn("#content")        // Imported action
  at 4s..6s customAnimation("#footer") // Local action
  at 6s..8s selectElement("#box")      // Built-in operation
}
```

### 4.7 Operation Data and Action Contracts (Feature 047)

Eligius passes one `operationData` object through an action's operations. Operations read
properties from it (dependencies, e.g. `addClass` needs `selectedElement`) and add properties
to it (outputs, e.g. `selectElement` adds `selectedElement`). Some operations erase properties
after use.

A called action starts with its caller's operation data, so it may rely on the caller:

```eligian
action highlight() [
  addClass("on")            // needs selectedElement: required from the caller
]

action show() [
  selectElement("#box")
  highlight()               // ✅ show provides selectedElement
]

timeline "main" in "#app" using raf {
  at 0s..1s show()          // ✅
  at 1s..2s highlight()     // ❌ Action 'highlight' requires 'selectedElement' ...
}
```

- **Contracts are inferred.** Each action's contract is the set of properties it reads without
  creating them. Contracts propagate through calls, and the editor shows them in the action's
  hover ("Requires from the caller").
- **Reported at entry points.** Errors appear where the starting data is known: timeline
  events, `sequence`/`stagger` items and inline blocks (start empty), event actions (start
  with only `eventArgs`), and `DOMEventListenerController` action lists (only `eventTarget`
  and the controller's `actionOperationData`, plus what earlier listed actions return).
- **Erasures are always errors**, wherever they occur: using a property that an earlier
  operation erased on the same path.
- **Outputs don't flow back.** A called action's outputs are not visible to its caller: after
  the call, the caller continues with its own operation data.
- **Branches and loops:** after `if/else`, only properties available in both branches remain.
  A `for` body may run zero times, so it adds nothing afterwards.
- **Dynamic outputs:** `setOperationData`, `setData` (`$operationdata.` targets),
  `removePropertiesFromOperationData` and `clearOperationData` are modelled from literal
  arguments. A non-literal argument stops further checking on that path.
- **Libraries:** a library action is checked where a program calls it, never in the library
  file on its own.

---

## 5. Event Actions

Event actions are special action definitions that execute in response to runtime events fired by the application or the Eligius timeline engine. Unlike regular actions that are explicitly invoked in timelines, event actions are triggered automatically when their associated event occurs.

### 5.1 Event Action Definition

**Syntax** (BNF notation):
```bnf
on event <eventName> (topic <topicName>)? action <ActionName> (( <parameters>? ))? [
  <operations>*
]
```

Where:
- `<eventName>` is a string literal naming one of the 43 Eligius events (e.g., `"language-change"`, `"timeline-play"`); see section 5.10
- `(topic <topicName>)?` is optional - use parentheses to indicate optionality in BNF
- `<ActionName>` is an identifier starting with an uppercase letter
- `<parameters>?` is an optional comma-separated parameter list; with no parameters the parentheses can be omitted (`action ShowCompletionMessage [ ... ]`), as for regular actions
- `[` and `]` are **literal square brackets** in the Eligian syntax (not EBNF notation)

**Components**:
- **eventName**: String literal - the Eligius event to listen for (e.g., "timeline-play", "language-change", "timeline-complete"). Unknown names are compile errors.
- **topicName**: Optional string literal - namespace for the event (allows multiple handlers for same event name in different contexts)
- **ActionName**: Identifier - name of the event action (should start with uppercase letter per convention)
- **parameters**: Optional parameter list - receives data from `eventArgs` array at runtime
- **operations**: Operation sequence - executes when event fires

**Note on Notation**: In this specification, we use `(...)` or `?` to indicate optional elements in BNF notation. The square brackets `[` and `]` in the syntax above are **literal characters** in Eligian code, not BNF notation.

**Example**:
```eligian
/**
 * Handle language change events
 * @param languageCode The new language code (e.g., "en-US", "nl-NL").
 *   Eligius types this as TLanguageCode, which maps to the DSL `string` annotation.
 */
on event "language-change" action HandleLanguageChange(languageCode: string) [
  selectElement("#language-display")
  setElementContent(languageCode)
  addClass("highlight")
  log(languageCode)
]
```

### 5.2 Event Topics (Namespacing)

Event topics allow multiple event actions to handle the same event name in different contexts. This is useful when you want different behaviors for the same event in different parts of your application.

**Syntax**:
```eligian
on event "<eventName>" topic "<topicName>" action <ActionName>(<parameters>) [
  <operations>*
]
```

**Example**:
```eligian
// Handle seek requests in the navigation context
on event "timeline-seek-request" topic "navigation" action HandleNavSeek(position: number) [
  selectElement(".nav-item")
  removeClass("active")
  selectElement("#nav-position")
  setElementContent(position)
]

// Handle seek requests in the scrubber context - same event, different topic
on event "timeline-seek-request" topic "scrubber" action HandleScrubberSeek(position: number) [
  selectElement("#scrubber-status")
  if (position == 0) {
    setElementContent("Start")
  } else {
    setElementContent(position)
  }
]
```

**Key Points**:
- **Optional**: Topics are optional - omit the `topic "<name>"` clause for global event handlers
- **Same event, multiple handlers**: Multiple event actions can listen to the same event name if they use different topics
- **Topic collision**: Two event actions with the same event name AND same topic (or both no topic) produce a warning (section 5.6)
- **Dispatching**: At runtime, events can be fired with or without a topic - only matching handlers execute

### 5.3 Parameter Mapping

Event action parameters map to the `eventArgs` array passed when the event is fired at runtime:

**Parameter Position Mapping**:
```eligian
// Event action definition
on event "timeline-seek" action HandleSeek(seekPosition: number, currentPosition: number, duration: number) [
  // seekPosition    = eventArgs[0]
  // currentPosition = eventArgs[1]
  // duration        = eventArgs[2]
  selectElement("#seek-target")
  setElementContent(seekPosition)
  selectElement("#seek-from")
  setElementContent(currentPosition)
  selectElement("#seek-duration")
  setElementContent(duration)
]
```

**Runtime Dispatch**:
```javascript
// JavaScript code that fires the event
eventbus.broadcast("timeline-seek", [12, 4, 60]);
```

**Zero-Parameter Events**:
Event actions can have zero parameters for events that carry no data:

```eligian
/**
 * Handle timeline completion (no parameters needed)
 */
on event "timeline-complete" action HandleTimelineComplete() [
  selectElement("#status")
  setElementContent("Timeline complete!")
  addClass("complete")
]
```

### 5.4 Event Action Naming Convention

**Convention**: Event action names should start with an uppercase letter (PascalCase) to distinguish them from regular actions:

```eligian
// ✅ Good - PascalCase for event actions
on event "timeline-play" action HandlePlay() [...]
on event "timeline-pause" action HandlePause() [...]

// ⚠️ Discouraged - lowercase (but not an error)
on event "timeline-play" action handlePlay() [...]
```

**Rationale**: This convention makes it clear at a glance which actions are event-driven vs. explicitly called in timelines.

### 5.5 Event Names

Event names are **restricted** to the 43 events Eligius fires (full list in section 5.10). Any other name is a compile error with "Did you mean?" suggestions. Use a `topic` to give the same event several handlers for different contexts.

Commonly used events:

**Timeline** (fired by the Eligius engine):
- `timeline-play`, `timeline-pause`, `timeline-stop`, `timeline-restart`, `timeline-complete`
- `timeline-seek` (seekPosition, currentPosition, duration), `timeline-seeked` (position, duration), `timeline-time` (position)

**Navigation**:
- `before-request-video-url` (index, requestedVideoPosition, isHistoryRequest)
- `navigate-to-video-url` (index, requestedVideoPosition), `video-complete` (index)

**Language Manager**:
- `language-change` (language: TLanguageCode)

**Controller**:
- `dom-mutation` (payload)

### 5.6 Validation Rules

**Empty Event Name**:
```eligian
on event "" action HandleEmpty() [...]
// ❌ ERROR: Event name cannot be an empty string
```

**Empty Topic String**:
```eligian
on event "timeline-play" topic "" action HandlePlay() [...]
// ❌ ERROR: Event topic cannot be an empty string. Either provide a topic name or omit the topic clause entirely.
```

**Duplicate Event Action** (warning, reported on every duplicate):
```eligian
on event "timeline-play" action HandlePlay() [...]
on event "timeline-play" action HandlePlayAgain() [...]
// ⚠️ WARNING: Multiple handlers defined for event 'timeline-play'. This may cause unexpected behavior.
```

**Topic Collision** (warning):
```eligian
on event "timeline-play" topic "nav" action HandleNavPlay() [...]
on event "timeline-play" topic "nav" action AnotherNavPlay() [...]
// ⚠️ WARNING: Multiple handlers defined for event 'timeline-play' with topic 'nav'. This may cause unexpected behavior.
```

**Note**: The compiler (CLI and extension compile command) fails on the first diagnostic of any severity, so a warning still blocks compilation. The IDE shows it as a warning.

**Name Collision with Built-in Operations**:
Event actions cannot have names that conflict with built-in operations:
```eligian
on event "timeline-play" action selectElement() [...]
// ❌ ERROR: Event action name 'selectElement' conflicts with built-in operation
```

### 5.7 Control Flow in Event Actions

Event actions support the full set of control flow statements:

**If/Else**:
```eligian
on event "timeline-seeked" action HandleSeeked(position: number, duration: number) [
  selectElement("#seek-status")
  setElementContent(position)
  if (position == duration) {
    selectElement("#seek-indicator")
    addClass("success")
    removeClass("error")
    selectElement("#seek-count")
    setElementContent(duration)
  } else {
    selectElement("#sync-indicator")
    addClass("error")
    removeClass("success")
  }
]
```

**For Loops**:
```eligian
// request-label-collections passes (labelIds: string[], callback): string[] maps to
// the `array` annotation; the callback has no DSL annotation and stays untyped
on event "request-label-collections" action HandleLabelCollections(labelIds: array, callback) [
  for (id in labelIds) {
    selectElement(".label-template")
    setElementContent(@@id)
    addClass("loaded")
  }
]
```

**Break/Continue**:
```eligian
on event "request-label-collections" action HandleLabelCollections(labelIds: array, callback) [
  for (id in labelIds) {
    if (@@id == "") {
      continue
    }
    if (@@id == "stop") {
      log("Stop marker encountered, ending loop")
      break
    }
    processLabel(@@id)
  }
]
```

### 5.8 Event Actions vs. Regular Actions

| Feature | Regular Actions | Event Actions |
|---------|----------------|---------------|
| **Invocation** | Explicitly called in timelines | Automatically triggered by events |
| **Timing** | Scheduled at specific times | Executes when event fires |
| **Parameters** | Passed at call site | Received from `eventArgs` array |
| **Naming** | lowercase or camelCase | PascalCase (convention) |
| **Syntax** | `action name() [...]` | `on event "name" action Name() [...]` |
| **Endable** | Can be endable actions | Cannot be endable (runtime events have no duration) |

### 5.9 Compilation Model

Event actions compile to `IEventActionConfiguration` objects in the Eligius JSON:

**Input** (Eligian):
```eligian
on event "language-change" topic "settings" action HandleLanguageChange(languageCode: string) [
  selectElement("#language-display")
  setElementContent(languageCode)
]
```

**Output** (Eligius JSON):
```json
{
  "eventActions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "HandleLanguageChange",
      "eventName": "language-change",
      "eventTopic": "settings",
      "operations": [
        {
          "systemName": "selectElement",
          "parameters": [
            "$operationdata.languageCode"
          ]
        },
        {
          "systemName": "setElementContent",
          "parameters": [
            "$operationdata.languageCode"
          ]
        }
      ]
    }
  ]
}
```

**Key Compilation Details**:
- Each event action gets a unique UUID v4 identifier
- Parameters map to `$operationdata.<paramName>` references
- Optional `eventTopic` field is only present if topic clause was specified
- Operations are compiled identically to regular action operations

### 5.10 Event Name Validation (Feature 029)

The compiler validates event names against the 43 events exported by Eligius (`eventmetadata` from the `eligius` package, generated into `packages/language/src/completion/metadata/timeline-events.generated.ts`). This catches typos and undefined event names before runtime.

**Validation Features**:
- Unknown event names are errors with "Did you mean?" suggestions (Levenshtein distance ≤ 2)
- Argument count: a warning when the parameter count differs from the event's argument count
- Type annotations (opt-in): the Eligius argument type is mapped to its DSL annotation (`string`, `number`, `boolean` as-is; `TLanguageCode` → `string`; `T[]` / `Array<T>` → `array`; `Record<...>` and object literal types → `object`) and compared with the declared annotation. Arguments typed `any` or as callbacks have no DSL annotation; annotating them is an error, leave them untyped.

**Example - Invalid Event Name**:
```eligian
// ❌ ERROR: Unknown event name: 'langauge-change' (Did you mean: language-change?)
on event "langauge-change" action HandleLanguageChange(language) [
  log(language)
]
```

**Example - Argument Count Mismatch**:
```eligian
// ⚠️ WARNING: event provides 3 arguments, action declares 2 parameters
on event "before-request-video-url" action HandleVideoURL(index: number, position: number) [
  log("Video request")
]
```

**Example - Type Mismatch**:
```eligian
// ❌ ERROR: Type mismatch for parameter 'language': declared as 'number' but event provides 'TLanguageCode' (annotate as 'string')
on event "language-change" action HandleLanguageChange(language: number) [...]

// ❌ ERROR: Type mismatch for parameter 'payload': declared as 'object' but event provides 'any', which has no Eligian type annotation. Remove the annotation.
on event "dom-mutation" action HandleMutation(payload: object) [...]
```

**Valid Eligius Events** (all 43, arguments in parentheses):
```
Timeline:
  before-request-timeline-uri, timeline-complete, timeline-firstframe,
  timeline-pause, timeline-pause-request, timeline-play, timeline-play-request,
  timeline-play-toggle-request, timeline-resize, timeline-resize-request,
  timeline-restart, timeline-stop, timeline-stop-request,
  timeline-container-request (callback), timeline-current-timeline-change (timelineUri),
  timeline-duration (getDuration), timeline-duration-request (callback),
  timeline-seek (seekPosition, currentPosition, duration),
  timeline-seek-request (position), timeline-seeked (position, duration),
  timeline-time (position)

Navigation:
  before-request-video-url (index, requestedVideoPosition, isHistoryRequest),
  highlight-navigation (videoUrlIndex), navigate-to-video-url (index, requestedVideoPosition),
  push-history-state (state), request-current-navigation (callback),
  request-current-video-position (callback), request-video-cleanup,
  request-video-url (videoUrlIndex, requestedVideoPosition, fromRouting),
  video-complete (index)

Engine Request:
  request-action (actionName, callback), request-current-language (callback),
  request-current-timeline-position (callback), request-engine-root (callback),
  request-function (systemName, callback), request-instance (instanceName, callback),
  request-label-collection (language, callback), request-label-collections (labelIds, callback),
  request-timeline-cleanup, request-timeline-uri (uri, position),
  timeline-request-current-timeline (callback)

Language Manager:
  language-change (language: TLanguageCode)

Controller:
  dom-mutation (payload)
```

**Implementation Details**:
- Validation in `packages/language/src/validators/event-action-validator.ts` (`checkEventNameExists`, argument count and type checks)
- Error codes: `unknown_event_name`, `empty_event_name`, `event_type_mismatch`, `unnecessary_type_annotation`

### 5.11 IDE Support and Code Completion (Feature 030)

The VS Code extension provides intelligent code completion for event actions, auto-generating complete action skeletons from event metadata.

**Trigger**: Type `on event ` and press **Ctrl+Space** (or Cmd+Space on macOS)

**What You Get**:
- Dropdown list of all 43 Eligius events with descriptions
- Selecting an event auto-generates a complete action skeleton:
  - Action name in camelCase convention (e.g., `handleLanguageChange`)
  - Parameters named after the event arguments, annotated with the DSL equivalent of the Eligius type (`TLanguageCode` → `string`, `string[]` → `array`); arguments typed `any` or as callbacks are emitted untyped
  - Empty operation body with the cursor placed inside

**Example Workflow**:
```eligian
// 1. Type this and press Ctrl+Space
on event "|"

// 2. Dropdown shows 43 events:
//    - language-change: Fires when language changes (param: language: string)
//    - timeline-complete: Fires when timeline finishes ()
//    - before-request-video-url: Fires before video URL request (params: index: number, ...)
//    ... 40 more ...

// 3. Select "language-change" and get (cursor inside the brackets;
//    TLanguageCode maps to the string annotation):
on event "language-change" action handleLanguageChange(language: string) [

]

// Selecting "timeline-seek" yields fully annotated parameters:
on event "timeline-seek" action handleTimelineSeek(seekPosition: number, currentPosition: number, duration: number) [

]
```

**Naming Convention**:
- Event action names generated in **camelCase** starting with lowercase `handle`
- Examples:
  - `"language-change"` → `handleLanguageChange`
  - `"before-request-video-url"` → `handleBeforeRequestVideoUrl`
  - `"timeline-complete"` → `handleTimelineComplete`

**Implementation Details**:
- Completion provider in `eligian-completion-provider.ts:completeEventName()`
- Event metadata with parameter counts and types in `timeline-events.generated.ts`
- Skeleton generation in `packages/language/src/completion/event-action-skeleton-generator.ts`

### 5.12 Controller Autocomplete (Feature 035)

The VS Code extension provides intelligent autocomplete for Eligius controllers, with context-aware completion for controller names and parameters.

**Controller Name Completion**:

Type `addController(` and press **Ctrl+Space** (or Cmd+Space on macOS) to see all available controllers.

**Dual Completion Modes**:

1. **Immediate completion** (no quotes typed):
   ```eligian
   addController(|)  // Cursor here, press Ctrl+Space
   // → Shows: LabelController, NavigationController, VideoController, ...
   // → Selecting "LabelController" inserts: "LabelController" (with quotes)
   ```

2. **Filtered completion** (quotes already typed):
   ```eligian
   addController("Lab|")  // Cursor here, typing filters the list
   // → Shows: LabelController
   // → Selecting completes to: "LabelController"
   ```

**Label ID Completion** (LabelController only):

For the second parameter of `LabelController`, autocomplete suggests imported label IDs:

```eligian
locales "./translations.json"  // Import locales first

timeline "demo" in "#app" using raf {
  at 0s selectElement("#title") {
    addController("LabelController", "|")  // Press Ctrl+Space
    // → Shows: welcome.title, welcome.subtitle, button.submit, ...
  }
}
```

**Completion Features**:
- **Controller metadata**: Auto-generated from Eligius controller registry
- **Parameter hints**: Shows controller parameters in detail text
- **Hover documentation**: Hover over controller names for descriptions
- **Type-ahead filtering**: VS Code filters as you type

**Available Controllers** (18 total):
- `LabelController` - Multi-language label rendering
- `NavigationController` - Page navigation with history
- `VideoController` - Video playback controls
- `AudioController` - Audio playback controls
- `LottieController` - Lottie animation playback
- `CarouselController` - Carousel/slideshow functionality
- And 12 more...

**Implementation Details**:
- Controller completion in `packages/language/src/completion/controllers.ts`
- Context detection in `packages/language/src/completion/context.ts`
- Controller metadata in `packages/language/src/completion/metadata/controllers.generated.ts`
- Hover provider in `packages/language/src/eligian-hover-provider.ts`

---

## 6. Timelines

### 6.1 Timeline Declaration

```eligian
timeline <name> in <containerSelector> using <provider> [<scrollSelector>] [from <source>] [loop] [duration <time>] {
  <events>*
}
```

**Parameters**:
- `name`: String literal - timeline identifier
- `containerSelector`: String literal - CSS selector for container element
- `provider`: Timeline provider type
- `source`: (Optional) Source file for video/audio providers
- `scrollSelector`: (Optional, `scroll` only) the scrollable element; defaults to `containerSelector`
- `loop`: (Optional) restart the timeline when it ends (Feature 049)
- `duration <time>`: (Optional) explicit timeline duration; without it, the end of the last event is used.
  It must be positive and not relative. Events that end after it get a warning (Feature 049)

The options come in the order shown.

**Providers**:
- `video` - Video element (requires `from` source)
- `audio` - Audio element (requires `from` source)
- `raf` - RequestAnimationFrame loop (no source)
- `scroll` - Scroll-driven: the scroll progress of an element maps onto the timeline duration, which is required (Feature 049). Compiles to an animation timeline with its own `ScrollPositionSource`
  The scroll element must exist in the layout HTML or the imported CSS (error), and some CSS rule or inline style should make it scroll vertically (`overflow-y: auto`; a warning). The preview also checks that it really scrolls: computed overflow and content taller than the element.
- `custom` - Custom provider (no source)

**Example**:

```eligian
timeline "presentation" in ".slide-container" using video from "slides.mp4" {
  at 0s..5s showTitle()
  at 5s..10s showContent()
}

timeline "animation" in "#canvas" using raf {
  at 0s..2s fadeIn("#box")
}

timeline "Story" in "#stage" using scroll "#scroller" duration 120s {
  at 0s for 10s [ selectElement("#intro") addClass("visible") ]
}

timeline "Ambient" in "#bg" using raf loop duration 30s {
  at 0s..30s [ selectElement("#bg") addClass("glow") ]
}
```

`loop`, `duration` and `scroll` are contextual keywords: they remain usable as parameter and
variable names. Hovering a timeline header shows its provider, effective duration and whether it
loops.

#### Lifecycle blocks: `on enter` / `on leave`

Operations that run when the timeline becomes active, and when it is left:

```eligian
timeline "Logic" in "#stage" using raf {
  on enter [ showView("#ch3") on click "#c3-to-hub" navigate "Hub" ]
  on leave [ hideView("#ch3") ]
  at 0s for 7s [ narrate("const names a value") ]
}
```

- `on enter` runs when the timeline becomes active: the first timeline when the presentation
  starts, any other one when it is navigated or switched to.
- `on leave` runs when the timeline is left: a `navigate` / switch to another timeline, a stop,
  or the engine being destroyed. It does **not** run when the timeline's content ends, so a view
  shown in `on enter` stays up after the last event.
- At most one of each per timeline, in any order and anywhere in the body. Both are operation
  lists like an inline `at` block (operations and action calls; an endable action called in
  `on leave` is ended).
- They compile to one open-ended timeline action (`duration: { start: 0 }`, no end, which
  Eligius treats as never ending on its own). It is not an event: it does not count towards the
  timeline's inferred duration, and relative times (`+2s`) and staggers count from the events.
  A timeline with only lifecycle blocks (a menu that waits for clicks) has duration 0.
- `enter` and `leave` are contextual keywords (still valid parameter and variable names).

This replaces the `at 0s..3600s [ setup ] [ teardown ]` trick, which gave every timeline a
duration of an hour and pushed relative times after it an hour out.

### 6.2 Timeline Events

#### Timed Events

```eligian
at <range> <actionCall>
at <range> <operationCall>
at <range> <controlFlow>
at <range> [ <start-ops>* ] ([ <end-ops>* ])?

<range> = <start>..<end> | <start> for <duration>
```

The end block of an inline block is optional (Feature 048): `at 0s..2s [ selectElement("#b") ]`
has no end operations.

**Examples**:

```eligian
// Action call (unified syntax)
at 0s..5s fadeIn("#title")

// Built-in operation call (same syntax as actions)
at 0s..5s selectElement("#box")

// Inline endable action
at 5s..10s [
  selectElement("#content")
  addClass("visible")
] [
  removeClass("visible")
]

// Start and duration, no end block
at 10s for 5s [
  selectElement("#content")
  addClass("highlight")
]

// Control flow with mixed action/operation calls
at 10s..15s for (item in items) {
  fadeIn(@@item)        // Custom action
  addClass("active")    // Built-in operation
}
```

**Note**: Custom actions and built-in operations use identical syntax. The compiler distinguishes them automatically based on name resolution.

#### Sequence Blocks

Sequential events with automatic time calculation:

```eligian
sequence {
  <actionCall> for <duration>
  <actionCall> for <duration>
  ...
}
```

**Example**:

```eligian
sequence {
  intro() for 5s
  main() for 10s
  outro() for 3s
}

// Compiles to:
// at 0s..5s intro()
// at 5s..15s main()
// at 15s..18s outro()
```

#### Stagger Blocks

Staggered events with incremental start times:

```eligian
stagger <delay> <items> with <action> for <duration>

stagger <delay> <items> for <duration> [
  <start-ops>*
] [
  <end-ops>*
]
```

**Example**:

```eligian
stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn() for 2s

// Compiles to:
// at 0s..2s { fadeIn(".item-1") }
// at 0.2s..2.2s { fadeIn(".item-2") }
// at 0.4s..2.4s { fadeIn(".item-3") }
```

The first item starts where the previous event ends. `at <time>` after the items anchors it
explicitly instead, so moving the stagger in the timeline does not change its times:

```eligian
stagger 200ms ["#a", "#b"] at editBeat.end with reveal() for 1.5s   // first item at editBeat's end
stagger 200ms ["#a", "#b"] at +2s with reveal() for 1.5s            // 2s after the previous event
```

### 6.3 Time Expressions

#### Time Literals

```eligian
42          // 42 seconds (no unit = seconds)
500ms       // 500 milliseconds
2s          // 2 seconds
1.5m        // 1.5 minutes
0.5h        // 0.5 hours
```

#### Relative Time Literals

```eligian
+2s         // 2 seconds after previous event ends
+500ms      // 500 milliseconds after previous event ends
+0s         // Immediately after previous event ends
```

#### Time Arithmetic

```eligian
5s + 2s     // 7 seconds
10s - 3s    // 7 seconds
2s * 3      // 6 seconds
10s / 2     // 5 seconds
```

#### Time Ranges

```eligian
at 0s..5s        // From 0s to 5s
at 1s..1s+2s     // From 1s to 3s (using arithmetic)
at +0s..+2s      // Relative timing
at 2s for 3s     // From 2s to 5s (start and duration, Feature 048)
at +0s for 3s    // Starts where the previous event ends, lasts 3s
```

- **Duration:** `for <duration>` takes any time expression in any unit (`at 500ms for 2s` ends
  at 2.5s). It must be greater than 0 and cannot be relative (`for +2s` is an error).
- **Converting:** the editor offers *Convert to '<start> for <length>'* on a `start..end` range
  whose length is statically known.
- **Inline stagger blocks** may also leave out their end block:
  `stagger 200ms items for 1s [ addClass("in") ]`.
- **Resolved times in the editor:** the VS Code extension shows the absolute times the compiler
  computes as inlay hints: after each sequence item (`‹5s..15s›`), after a stagger block
  (`‹22s..23.8s ×3›`), after relative, computed and `for` ranges, and the inferred duration on a
  timeline header without `duration`. A time that depends on a runtime value (`$globaldata.end`),
  and any relative time after it, has no hint.

#### Time Constants and Event Labels

A program-level `const` can hold a time, and an `at` event can be labeled with `as <name>`.
Later times refer to them:

```eligian
const beat = 7s
const outro = @beat * 2 + 500ms

timeline "Tools" in "#stage" using raf duration closing.end + 1s {
  at 15s for @beat as editBeat [ narrate("edit one, the rest follow") ]
  stagger 200ms ["#card-1", "#card-2"] at editBeat.end with revealCard() for 1.5s
  at editBeat.start + 3s for @outro as closing [ narrate("done") ]
}
```

- **Time constants:** `const beat = 7s` (any unit; arithmetic on times, numbers and other time
  constants is allowed). In a time it is written `@beat`, like every constant reference. A
  number constant used in a time counts in seconds, like a unitless time literal. A time constant only exists
  at compile time: it cannot be used in operation arguments, and a time like `7s` cannot appear
  outside a program-level const.
- **Event labels:** `at <range> as <name> [ ... ]` names a timed event. `<name>.start` and
  `<name>.end` are its absolute times. A time can only refer to events **earlier** in the same
  timeline (so times never depend on each other in a cycle); the timeline header's `duration` may
  refer to any label. Labels are unique within a timeline.
- The editor's inlay hints and `▶ Preview from …` CodeLenses resolve constants, labels and
  anchors the same way the compiler does.

---

## 7. Expressions

### 7.1 Literals

```eligian
42                          // Number
"hello"                     // String
true, false                 // Boolean
null                        // Null
{opacity: 1, scale: 2}      // Object
[1, 2, 3]                   // Array
```

### 7.2 Object Literals

```eligian
{ <key>: <value>, ... }
```

Keys can be identifiers or strings:

```eligian
{opacity: 1, color: "red"}
{"font-size": "16px", margin: 10}
```

### 7.3 Array Literals

```eligian
[ <value>, <value>, ... ]
```

**Example**:

```eligian
[1, 2, 3]
["red", "green", "blue"]
[$scope.item1, $scope.item2]
```

### 7.4 Binary Expressions

#### Arithmetic

```eligian
+ - * / % **
```

#### Comparison

```eligian
< <= > >= == !=
```

#### Logical

```eligian
&& ||
```

**Example**:

```eligian
action checkAndActivate(count: number, enabled: boolean) [
  if (count > 5 && enabled) {
    addClass("active")
  }
]
```

#### Precedence (tightest first)

| Operators | Associativity |
|-----------|---------------|
| `**` | right (`2 ** 3 ** 2` = `2 ** 9` = 512) |
| unary `-`, `!` | prefix (`-2 ** 2` = `-(2 ** 2)` = -4) |
| `*` `/` `%` | left (`2 * 3 ** 2` = 18) |
| `+` `-` | left |
| `<` `<=` `>` `>=` | left |
| `==` `!=` | left |
| `&&` | left |
| `\|\|` | left |

#### Compile-time evaluation

Outside `if` conditions, operator expressions are evaluated at compile time and must consist of
compile-time constants (literals and `const` values). There is no implicit type coercion:

- Arithmetic (`-` `*` `/` `%` `**`) needs numbers; `+` adds numbers or concatenates when either
  side is a string; `<` `<=` `>` `>=` compare two numbers or two strings.
- Division or modulo by zero, a wrong operand type (`"abc" - 1`, `true + 1`) and a non-finite
  result are compile errors.
- An operator applied to a runtime value (parameter, variable, system property, property chain)
  is a compile error. Comparisons, `&&`, `||` and `!` on runtime values are supported only inside
  `if` conditions. Arithmetic on runtime values is not supported anywhere; use the `calc`
  operation (its result is `$operationdata.calculationResult`). The exception is string
  concatenation, below.

#### Runtime string concatenation

`+` concatenates runtime values when it is a string concatenation: one of its operands is
statically a string. That is a string literal, a parameter annotated `: string`, a `const` with a
string value, or another string concatenation.

```eligian
action showSlide(slideId, duration: number) [
  selectElement("#" + slideId)                  // "#intro"
  setElementContent("Slide " + slideId + "!")   // any operation, any parameter
  setStyle({ width: duration + "px" })          // inside object and array arguments
]

action highlight(prefix: string, id) [
  selectElement(prefix + id)                    // a ': string' parameter makes it a concatenation
]
```

- **Allowed in**: operation arguments, action call arguments (in actions and timelines) and
  action-level `const` declarations, at any depth of object and array literals.
- **Not allowed in**: `if` conditions, `for` collections, time expressions and program-level
  constants. These are compile errors with an editor diagnostic.
- **Evaluation**: left to right, as in JavaScript. `a + b + "px"` with untyped `a` and `b` is an
  addition followed by a concatenation, and the addition is a compile error. Write
  `"" + a + b + "px"` or annotate a parameter to concatenate both.
- **Operands**: constants are converted to strings at compile time (`"v" + 1.5` is `"v1.5"`). A
  runtime `null` or `undefined` becomes an empty string. Objects and arrays are compile errors.
- **Constant concatenations** (`"#" + "box"`, `"v" + @VERSION`) still fold at compile time.

**Compilation**: each concatenation becomes a `setOperationData` that resolves the parts and a
`concatenateStrings` that joins them into `$operationdata.result`:

```json
{ "systemName": "setOperationData", "operationData": { "properties": { "strings": ["#", "$operationdata.slideId"] } } },
{ "systemName": "concatenateStrings", "operationData": {} },
{ "systemName": "selectElement", "operationData": { "selector": "$operationdata.result" } }
```

With several concatenations in one operation, each result is copied to a private key
(`__eligianConcat0`, ...) that is removed after the operation. When the surrounding action uses
`$operationdata.result` itself, its value is saved and restored around the concatenations.

#### Runtime values in operation arguments

Eligius resolves property chains only inside the operations that resolve their own inputs:
`selectElement` (selector), `setStyle`, `createElement`, `calc`, `math`, `forEach`
(collection), `broadcastEvent` (eventArgs), `setData`, `setOperationData` and `when`. For every
other operation, an argument that contains a runtime value is resolved by a `setOperationData`
emitted just before it:

```eligian
action show(label) [
  selectElement("#box")
  setElementContent(label)   // → setOperationData({ properties: { template: "$operationdata.label" } })
]                            //   setElementContent()
```

An argument that forwards a parameter of the same name needs nothing extra, because Eligius
already passes action parameters as operation data.

### 7.5 Unary Expressions

```eligian
-<expr>     // Negation
!<expr>     // Logical NOT
```

---

## 8. Statements

### 8.1 Operation Calls

```eligian
<operationName>(<arg1>, <arg2>, ...)
```

**Examples**:

```eligian
selectElement("#box")
animate({opacity: 1}, 500)
addClass("visible")
setStyle({color: "red", fontSize: "16px"})
```

**Note**: The grammar is operation-agnostic. Valid operations are defined by the Eligius operation registry.

### 8.1.1 Controller Operations (Feature 035)

The `addController()` operation provides a specialized syntax for adding Eligius controllers to selected elements:

```eligian
addController("<controllerName>", <parameters>?)
```

**Parameters**:
- `controllerName` (string, required) - Name of the controller class (e.g., `"LabelController"`, `"NavigationController"`)
- `parameters` (object, optional) - Controller-specific configuration (varies by controller)

**Available Controllers**:
- `LabelController` - Multi-language label rendering
- `NavigationController` - Page navigation with history
- `VideoController` - Video playback controls
- `AudioController` - Audio playback controls
- And more...

**Examples**:

```eligian
// LabelController with label ID
selectElement("#title")
addController("LabelController", "welcome.title")

// NavigationController with page configuration
selectElement("#nav")
addController("NavigationController", {
  pages: ["home", "about", "contact"],
  defaultPage: "home"
})

// VideoController (no parameters)
selectElement("#player")
addController("VideoController")
```

**Compilation**: Expands to `getControllerInstance()` + `addControllerToElement()` operations.

**IDE Support**:
- **Controller name autocomplete**: Type `addController(` and press Ctrl+Space to see all available controllers
  - Dual completion modes:
    - `addController(` → Ctrl+Space → Inserts `"LabelController"` (with quotes)
    - `addController("Lab` → Filters to matching controllers
- **Label ID autocomplete**: For `LabelController`, the second parameter suggests imported label IDs
- **Hover documentation**: Hover over controller names to see parameters and descriptions

### 8.2 Variable Declarations

```eligian
const <name> = <expression>
```

**Scope**:
- **Global scope** (top-level): Added to `$globaldata.<name>`
- **Action scope**: Added to `$scope.variables.<name>`, accessed via `@<name>`

**Examples**:

```eligian
// Global variable
const duration = 1000

// Action-scoped variable
action demo() [
  const speed = 500
  wait(@speed)  // Access via @speed
]
```

### 8.3 If/Else Statements

```eligian
if (<condition>) {
  <operations>*
}

if (<condition>) {
  <operations>*
} else {
  <operations>*
}

if (<condition>) {
  <operations>*
} else if (<condition>) {
  <operations>*
} else {
  <operations>*
}
```

`else if` chains can be as long as needed, and the final `else` is optional.

**Example**:

```eligian
action toggle(enabled: boolean) [
  if (enabled) {
    addClass("active")
  } else {
    removeClass("active")
  }
]
```

**Compilation**: Compiles to `when()` / `otherwise()` / `endWhen()` operations.

**Else-if chains**: `else if (b) { ... }` is shorthand for `else { if (b) { ... } }`, so each
`else if` compiles to a `when()` / `endWhen()` pair nested inside the preceding `otherwise()`:

```eligian
action showMode(mode: string) [
  if (mode == "a") {
    addClass("mode-a")
  } else if (mode == "b") {
    addClass("mode-b")
  } else {
    addClass("mode-default")
  }
]
```

```
when      { expression: "$operationdata.mode == 'a'" }
addClass  { className: "mode-a" }
otherwise
  when      { expression: "$operationdata.mode == 'b'" }
  addClass  { className: "mode-b" }
  otherwise
  addClass  { className: "mode-default" }
  endWhen
endWhen
```

### 8.4 For Loops

```eligian
for (<itemName> in <collection>) {
  <operations>*
}
```

**Example**:

```eligian
action processItems(items: array) [
  for (item in items) {
    selectElement(".template")
    setElementContent(@@currentItem)
  }
]
```

**Compilation**: Compiles to `forEach()` / `endForEach()` operations.

**Iterator Access**: Inside loop, use `@@currentItem`, `@@loopIndex`, `@@loopLength` system properties.

### 8.5 Break/Continue Statements

```eligian
break       // Exit loop immediately
continue    // Skip to next iteration
```

**Example**:

```eligian
for (item in items) {
  if (@@currentItem.skip) {
    continue
  }
  if (@@currentItem.stop) {
    break
  }
  processItem(@@currentItem)
}
```

**Compilation**: `break` → `breakForEach()`, `continue` → `continueForEach()`

**Validation**: Can only be used inside `for` loops.

---

## 9. Type System

### 9.1 Type Annotations

Type annotations are **optional** and used for compile-time type checking:

```eligian
action demo(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

### 9.2 Supported Types

| Type | Description | Examples |
|------|-------------|----------|
| `string` | String literals, selectors | `"hello"`, `"#box"` |
| `number` | Numeric values | `42`, `3.14`, `500` |
| `boolean` | Boolean values | `true`, `false` |
| `object` | Object literals | `{opacity: 1}` |
| `array` | Array literals | `[1, 2, 3]` |

### 9.3 Type Checking

Type checking occurs at:

1. **Operation calls**: Arguments validated against operation parameter types
2. **Action calls**: Arguments validated against action parameter types
3. **Variable assignments**: (Future feature - not yet implemented)

**Example**:

```eligian
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

timeline "test" in "#app" using raf {
  at 0s..1s fadeIn("#box", 500)          // ✅ Correct
  at 1s..2s fadeIn(123, "slow")          // ❌ ERROR: Both args wrong type
  at 2s..3s fadeIn("#box", "slow")       // ❌ ERROR: duration expects number
}
```

### 9.4 Type Inference

**Current**: Parameters without type annotations remain untyped (no validation).

**Future (User Story 3)**: Types will be inferred from usage patterns:

```eligian
action autoInfer(selector, duration) [
  selectElement(selector)  // selector inferred as string
  animate({opacity: 1}, duration)  // duration inferred as number
]
```

### 9.5 Gradual Typing

Type checking is **opt-in**. Untyped code works unchanged:

```eligian
// ✅ No type annotations - no type checking
action oldStyle(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

// ✅ Mixed typed/untyped parameters
action mixed(selector: string, duration) [
  selectElement(selector)  // selector type-checked
  animate({opacity: 1}, duration)  // duration not checked
]
```

---

## 10. Scoping and References

### 10.1 Scopes

Eligian has three runtime scopes (mapped to Eligius scopes):

| Syntax | Eligius Scope | Purpose |
|--------|---------------|---------|
| `$globaldata.<name>` | `globaldata` | Global variables (`const` at top-level) |
| `$operationdata.<name>` | `operationdata` | Action parameters |
| `$scope.<property>` | `scope` | Runtime state (loop iterators, etc.) |

### 10.2 Property Chain References

Access runtime data with `$` prefix:

```eligian
$globaldata.theme
$operationdata.selector
$scope.currentItem
$scope.currentItem.name
```

**Compilation**: Compiles to property chain strings for Eligius runtime.

### 10.3 System Property References

Access system scope properties with `@@` prefix:

```eligian
@@currentItem       // $scope.currentItem
@@loopIndex         // $scope.loopIndex
@@loopLength        // $scope.loopLength
```

**Available in**: `for` loops

### 10.4 Variable References

Access action-scoped variables with `@` prefix:

```eligian
action demo() [
  const speed = 500
  wait(@speed)           // ✅ Correct
  wait($scope.variables.speed)  // ✅ Also correct (explicit)
]
```

**Compilation**: `@name` → `$scope.variables.name`

### 10.5 Parameter References

**Inside action bodies**: Parameters are accessed directly by name:

```eligian
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**Compilation**: The compiler automatically expands direct parameter references to `$operationdata.<name>` in the compiled output.

---

## 11. Compilation Model

### 11.1 Compilation Pipeline

1. **Parse**: Langium parses `.eligian` source to AST
2. **Validate**: Semantic validation (scoping, name resolution)
3. **Type Check**: Typir validates type annotations (if present)
4. **Transform**: AST → Eligius JSON configuration
5. **Optimize**: Dead code elimination, constant folding
6. **Emit**: Output JSON file

### 11.2 Output Format

Eligian compiles to Eligius JSON configuration:

**Input** (Eligian):

```eligian
action fadeIn(selector: string) [
  selectElement(selector)
  animate({opacity: 1}, 1000)
]

timeline "main" in "#app" using raf {
  at 0s..2s fadeIn("#title")
}
```

**Output** (Eligius JSON):

```json
{
  "actions": {
    "fadeIn": {
      "operations": [
        {
          "type": "selectElement",
          "parameters": [] // at runtime the selector argument will be set by the calling site
        },
        {
          "type": "animate",
          "parameters": [{"opacity": 1}, 1000]
        }
      ]
    }
  },
  "timeline": {
    "name": "main",
    "container": "#app",
    "provider": "raf",
    "events": [
      {
        "start": 0,
        "end": 2000,
        "action": "fadeIn",
        "parameters": {"selector": "#title"}
      }
    ]
  }
}
```

### 11.3 Syntactic Sugar Transformations

| Eligian Syntax | Compiles To |
|----------------|-------------|
| `if (cond) { ops }` | `when(cond)`, ops, `endWhen()` |
| `if (cond) { a } else { b }` | `when(cond)`, a, `otherwise()`, b, `endWhen()` |
| `for (item in list) { ops }` | `forEach(list)`, ops, `endForEach()` |
| `break` | `breakForEach()` |
| `continue` | `continueForEach()` |
| `@@currentItem` | `"$scope.currentItem"` (string) |
| `@varName` | `"$scope.variables.varName"` (string) |

---

## 12. CSS Integration and Validation (Feature 013)

The Eligian DSL provides comprehensive CSS support with real-time validation, hot-reload, and intelligent error messages.

### 12.1 CSS File Imports

Import CSS files using the `styles` keyword:

```eligian
styles "./styles.css"
styles "./theme.css"
styles "./animations.css"
```

**Key Features**:
- Multiple CSS files can be imported (loaded in order)
- **Path Resolution**: CSS file paths are resolved **relative to the `.eligian` source file's directory**, not the workspace root
- CSS files are parsed using PostCSS for class/ID extraction
- Imported CSS is automatically loaded into VS Code preview with hot-reload

**Path Resolution Example**:
```
Project Structure:
  workspace-root/
    examples/
      demo.eligian         ← Source file
      demo-styles.css      ← CSS file
    styles/
      global.css
```

```eligian
// In examples/demo.eligian:
styles "./demo-styles.css"      // ✅ Resolved to: workspace-root/examples/demo-styles.css
styles "../styles/global.css"   // ✅ Resolved to: workspace-root/styles/global.css
```

**Important**: CSS paths are always relative to the source file's location, ensuring consistent behavior regardless of where VS Code is opened or how the compiler is invoked.

### 12.2 CSS Class Name Validation

The compiler validates that CSS class names used in operations are defined in imported CSS files.

**Validated Operations**:
- `addClass("<className>")`
- `removeClass("<className>")`
- `toggleClass("<className>")`
- `hasClass("<className>")`

**Example - Valid**:
```eligian
styles "./styles.css"  // Contains .button, .primary, .disabled

action highlight(selector: string) [
  selectElement(selector)
  addClass("button")     // ✅ Valid - .button exists
  addClass("primary")    // ✅ Valid - .primary exists
]
```

**Example - Invalid with Suggestions**:
```eligian
styles "./styles.css"  // Contains .button, .primary

action highlight(selector: string) [
  selectElement(selector)
  addClass("buttom")     // ❌ ERROR: Unknown CSS class: 'buttom' (Did you mean: 'button'?)
  addClass("primry")     // ❌ ERROR: Unknown CSS class: 'primry' (Did you mean: 'primary'?)
]
```

**"Did you mean?" Logic**:
- Uses Levenshtein distance algorithm
- Suggests classes with edit distance ≤ 2
- Ranks suggestions by similarity
- Maximum 3 suggestions shown

### 12.3 CSS Selector Validation

The compiler validates complex CSS selectors used in element selection operations.

**Validated Locations**:
- `selectElement("<selector>")` (the only selector-taking operation in the registry; the validator set also lists `selectElements`, `querySelector` and `querySelectorAll` for forward compatibility)
- The timeline container selector: `timeline "name" in "<selector>" using raf`

**Selector Parsing**:
- Handles combinators: `.parent > .child`, `.sibling + .next`, `.general ~ .sibling`
- Handles pseudo-classes: `.button:hover`, `.input:focus`, `.item:nth-child(2)`
- Handles attribute selectors: `[data-id="foo"]`, `[type="text"]`
- Validates each class and ID component independently

**Example - Valid Selectors**:
```eligian
styles "./styles.css"  // Contains .button, .primary, #header

action setup() [
  selectElement("#header")                    // ✅ Valid - #header exists
  selectElement(".button.primary")            // ✅ Valid - both classes exist
  selectElement(".button:hover")              // ✅ Valid - .button exists, :hover is pseudo-class
  selectElement(".parent > .button")          // ✅ Valid - both classes exist
  selectElement("[data-active] .button")      // ✅ Valid - .button exists, attribute selector ignored
]
```

**Example - Invalid Selectors**:
```eligian
styles "./styles.css"  // Contains .button, #header

action setup() [
  selectElement(".buton")                     // ❌ ERROR: Unknown CSS class in selector: 'buton'
  selectElement("#heade")                     // ❌ ERROR: Unknown CSS ID in selector: 'heade'
  selectElement(".button.invalid")            // ❌ ERROR: Unknown CSS class in selector: 'invalid'
  selectElement(".button[")                   // ❌ ERROR: Invalid CSS selector syntax: Unclosed attribute selector
]
```

### 12.4 Hot-Reload Validation

CSS validation automatically updates when CSS files change at runtime.

**Workflow**:
1. Developer edits `styles.css` and saves
2. Extension's `CSSWatcherManager` detects change (300ms debounce)
3. Extension sends `CSS_UPDATED_NOTIFICATION` to language server
4. Language server re-parses CSS file and updates internal registry
5. Language server triggers re-validation of all importing `.eligian` files
6. VS Code Problems panel shows updated diagnostics

**Performance**:
- CSS parsing: <50ms for typical stylesheets
- Hot-reload: <300ms (debounce period)
- Validation: Real-time with no noticeable lag

### 12.5 Invalid CSS File Handling

If an imported CSS file has syntax errors, the error is shown at the import statement.

**Example**:
```eligian
styles "./broken.css"  // ❌ ERROR: CSS file './broken.css' has syntax errors (line 5, column 10): Unclosed block
```

**Error Details**:
- Error code: `'invalid_css_file'`
- Includes line/column of CSS syntax error
- CSS file still tracked (validation continues with what could be parsed)
- Diagnostic shown only at import statement, not at every usage

### 12.6 Implementation Details

**Core Modules**:
- `css-parser.ts` - PostCSS-based parser for extracting classes, IDs, and locations
- `css-registry.ts` - Centralized registry tracking CSS file metadata per document
- `selector-parser.ts` - Complex selector parsing with combinator/pseudo-class handling
- `levenshtein.ts` - Edit distance algorithm for "Did you mean?" suggestions

**Validator Integration**:
- `eligian-validator.ts:checkClassNameParameter()` - Validates className parameters
- `eligian-validator.ts:checkSelectorParameter()` - Validates selector parameters
- `eligian-validator.ts:validateCSSFileErrors()` - Validates CSS file syntax

**Extension Integration**:
- `css-watcher.ts` - FileSystemWatcher for CSS file changes
- `webview-css-injector.ts` - CSS injection into preview webview
- LSP notifications for hot-reload coordination

---

## 13. VS Code Preview Integration (Feature 011)

The VS Code extension provides an integrated preview that renders Eligian timelines with automatic CSS loading and hot-reload.

### 13.1 Preview Activation

**Command**: `Eligian: Open Preview`

The preview opens in a side panel and displays the rendered Eligius timeline with:
- HTML layout from `layout` import
- CSS styles from `styles` imports
- Timeline playback controls
- A scrubber with a time readout, a timeline picker (one entry per `timeline`) and, for a
  program with `languages`, a language picker that broadcasts Eligius' `language-change`.
  The picked language is kept across recompiles
- Real-time synchronization with source code

**Preview from here**: the editor shows a `▶ Preview` CodeLens above each timeline and
`▶ Preview from 22s` above each timed event, sequence item and stagger block whose start time is
known statically. It opens the preview, switches to that timeline, seeks to that time and plays.
The setting `eligian.codeLens.preview` turns the lenses off.

### 13.2 CSS Injection

CSS files imported via `styles` keyword are automatically loaded into the preview webview.

**Initial Load**:
1. Eligian file is compiled to Eligius JSON
2. CSS file paths extracted from `config.cssFiles[]`
3. CSS files loaded and parsed
4. `url()` paths rewritten to webview URIs
5. CSS injected as `<style data-css-id="...">` tags in preview `<head>`

**Performance**: <500ms initial CSS load

### 13.3 Hot-Reload

CSS changes automatically reload in the preview without restarting the timeline.

**Workflow**:
1. Developer edits `styles.css` and saves
2. FileSystemWatcher detects change (300ms debounce per file)
3. CSS file reloaded and URLs rewritten
4. `css-reload` message sent to webview
5. Webview updates `<style>` tag's `textContent`
6. **Timeline continues playing** (no engine restart)

**Performance**: <300ms hot-reload (debounce period)

**Debouncing**: Per-file independent debouncing handles parallel editing of multiple CSS files

### 13.4 URL Rewriting for Webview

CSS `url()` paths must be rewritten to webview URIs because inline `<style>` tags have no file context.

**Example**:
```css
/* Original CSS (styles.css) */
.background {
  background-image: url('./images/bg.png');
  font-face: url('../fonts/custom.woff2');
}

/* Rewritten for webview */
.background {
  background-image: url('vscode-webview://authority/workspace/path/images/bg.png');
  font-face: url('vscode-webview://authority/workspace/path/fonts/custom.woff2');
}
```

**Supported**: Images, fonts, and other resources referenced in CSS

### 13.5 Error Handling

**File Not Found**:
```
CSS file './styles.css' not found
[Open File] button to create or check path
```

**Permission Denied**:
```
Cannot read CSS file './styles.css': Permission denied
```

**Rate Limiting**: Max 3 error notifications per minute per file (prevents spam during rapid edits)

**Graceful Degradation**: Preview remains functional with previous valid CSS if reload fails

### 13.6 Content Security Policy

The preview HTML template includes CSP directives for CSS:
- `style-src 'unsafe-inline'` - Required for inline `<style>` tags
- `img-src ${cspSource} https: data:` - Required for images in CSS
- `font-src ${cspSource}` - Required for fonts in CSS

**Security Note**: CSS content is sanitized using `textContent` (not `innerHTML`) to prevent XSS

### 13.7 Implementation Details

**Core Modules**:
- `css-loader.ts` - Pure utility functions (file loading, URL rewriting, ID generation)
- `webview-css-injector.ts` - CSS lifecycle management (inject, reload, error handling)
- `css-watcher.ts` - FileSystemWatcher for hot-reload
- `preview.ts` - Webview message handlers (`css-load`, `css-reload`, `css-remove`, `css-error`)

**Message Protocol**:
```typescript
// Initial injection
{ type: 'css-load', cssId: 'abc123', content: '...' }

// Hot-reload
{ type: 'css-reload', cssId: 'abc123', content: '...' }

// Remove CSS
{ type: 'css-remove', cssId: 'abc123' }

// Error occurred
{ type: 'css-error', cssId: 'abc123', error: '...' }
```

---

```
EligianFile     := Program | Library

Program         := ProgramStatement*
ProgramStatement := ImportStatement | ProgramElement
ProgramElement  := ActionDefinition | EventActionDefinition | Timeline | VariableDeclaration

Library         := 'library' ID ActionDefinition*

ImportStatement := DefaultImport | NamedImport | LibraryImport
DefaultImport   := ('layout' | 'styles' | 'provider' | 'locales') STRING
NamedImport     := 'import' ID 'from' STRING ('as' AssetType)?
LibraryImport   := 'import' '{' ActionImport (',' ActionImport)* '}' 'from' STRING
ActionImport    := ID ('as' ID)?
AssetType       := 'html' | 'css' | 'media'

ActionDefinition := RegularActionDefinition | EndableActionDefinition
RegularActionDefinition := ('private')? 'action' ID '(' Parameters? ')' '[' Operations ']'
EndableActionDefinition := ('private')? 'endable' 'action' ID '(' Parameters? ')'
                          '[' Operations ']' '[' Operations ']'

EventActionDefinition := 'on' 'event' STRING ('topic' STRING)? 'action' ID '(' Parameters? ')' '[' Operations ']'

Parameter       := ID (':' TypeAnnotation)?
TypeAnnotation  := 'string' | 'number' | 'boolean' | 'object' | 'array'

Timeline        := 'timeline' STRING 'in' STRING 'using' Provider ('from' STRING)?
                   '{' (Lifecycle | TimelineEvent)* '}'
Lifecycle       := 'on' ('enter' | 'leave') '[' OperationStatement* ']'
Provider        := 'video' | 'audio' | 'raf' | 'custom'

TimelineEvent   := TimedEvent | SequenceBlock | StaggerBlock
TimedEvent      := 'at' TimeRange ('as' Identifier)? (NamedAction | InlineAction)
SequenceBlock   := 'sequence' '{' SequenceItem* '}'
StaggerBlock    := 'stagger' TimeExpr Expression ('at' TimeExpr)? 'with' ActionCall 'for' TimeExpr
                 | 'stagger' TimeExpr Expression ('at' TimeExpr)? 'for' TimeExpr
                   '[' Operations ']' '[' Operations ']'

TimeRange       := TimeExpression '..' TimeExpression
TimeExpression  := TimeLiteral | RelativeTimeLiteral | BinaryTimeExpr
                 | '@' ConstName | EventLabel '.' ('start' | 'end')
TimeLiteral     := NUMBER TimeUnit?
RelativeTimeLiteral := '+' NUMBER TimeUnit?
TimeUnit        := 'ms' | 's' | 'm' | 'h'

Operations      := (OperationCall | IfStatement | ForStatement |
                   VariableDeclaration | BreakStatement | ContinueStatement)*

IfStatement     := 'if' '(' Expression ')' '{' Operations '}'
                   ('else' '{' Operations '}')?
ForStatement    := 'for' '(' ID 'in' Expression ')' '{' Operations '}'
BreakStatement  := 'break'
ContinueStatement := 'continue'
VariableDeclaration := 'const' ID '=' Expression

OperationCall   := ID '(' Arguments? ')'

Expression      := Literal | ObjectLiteral | ArrayLiteral |
                   PropertyChainRef | SystemPropertyRef |
                   VariableRef | ParameterRef | BinaryExpr | UnaryExpr

PropertyChainRef := '$' Scope ('.' ID)+
Scope           := 'globaldata' | 'operationdata' | 'scope'
SystemPropertyRef := '@@' ID ('.' ID)*
VariableRef     := '@' ID
ParameterRef    := ID  (cross-reference to Parameter)
```

---

## Appendix B: Reserved Identifiers

System property names (used with `@@` prefix):

- `currentItem` - Current loop item
- `loopIndex` - Current loop index
- `loopLength` - Total loop length

Standard scope names (used with `$` prefix):

- `globaldata` - Global scope
- `operationdata` - Action parameter scope
- `scope` - Runtime scope

---

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.8.0 | 2026-10-31 | **Feature 049 - Timeline header options** (section 6.1): `scroll` provider (ScrollPositionSource), `loop`, explicit `duration` with a warning for events past it, timeline hover. **Feature 048 - `for` durations and optional end blocks** (sections 6.2, 6.3): `at 2s for 3s`, relative starts with durations, inline timeline/stagger blocks without an end block, and a code action converting `a..b` to `a for <length>`. **Feature 047 - Operation-data contracts** (section 4.7): dependencies are checked by one dataflow analysis shared by the editor and the compiler; called actions inherit their caller's state through inferred contracts. **Feature 046 - Runtime string concatenation** (section 7.4): `+` with a string operand over runtime values compiles to `concatenateStrings` in operation/action call arguments and action-level consts. Runtime values passed to operations that do not resolve property chains themselves are resolved by a preceding `setOperationData` (previously they arrived as literal chain strings). |
| 1.7.0 | 2026-10-17 | **Feature 045 - Locales Import**: `labels` import replaced by `locales` (section 3.2.4); nested JSON format keyed by locale code, compiles to `config.locales`, requires a `languages` block; translation keys referenced via `LabelController`. **Feature 029 corrections**: event names are restricted to the 43 Eligius events (sections 5.5, 5.10); the previous event list contained non-existent events. Duplicate event handlers documented as warnings; noted that the compiler fails on any diagnostic. Keyword list and grammar summary updated. |
| 1.5.2 | 2025-11-17 | **Feature 033 - Labels Import**: Added labels import support for internationalization (section 3.2.4). Labels JSON files validated against JSON Schema with compile-time error reporting. Labels assigned to Eligius configuration's `labels` property. Added `labels` keyword to reserved keywords list. Updated grammar to include labels in DefaultImport. |
| 1.5.1 | 2025-11-17 | **Feature 032 Improvements**: Added nested library dependency documentation (section 3.3.5), library cache invalidation documentation (section 3.3.6), parameter count validation for imported actions, library file compilation prevention. Updated CSS path resolution to clarify paths are relative to source file directory (section 12.1). Bug fixes: validator now checks imported action parameter counts, CSS paths resolve correctly for files in subdirectories, library compilation prevented with clear error message. |
| 1.5.0 | 2025-11-13 | **Major Update**: Fixed critical syntax notation issues, added complete documentation for 10+ missing features: Event name validation (Feature 029), event action code completion (Feature 030), CSS class/selector validation (Feature 013), preview CSS support with hot-reload (Feature 011), expanded JSDoc documentation (Feature 020), Typir integration details (Feature 021), comprehensive library file validation (Feature 023). Updated keyword list to include all 11 missing keywords. Verified 1,758 tests passing, 81.72% coverage. Added new sections 5.10, 5.11, 12, 13. |
| 1.4.0 | 2025-11-10 | Added event action support (Feature 028): event action definitions, event topic namespacing, runtime event handling |
| 1.3.1 | 2025-11-06 | Documentation fixes: corrected parameter reference syntax throughout (prefer direct references over `$operationdata` prefix), updated reserved keywords list, fixed grammar summary to include imports and library files |
| 1.3.0 | 2025-11-02 | Added library file support (Feature 023), library import statements, `private` visibility modifier for actions, library-specific validation rules |
| 1.0.0 | 2025-10-21 | Initial specification based on current grammar |

---

**End of Specification**
