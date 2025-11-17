# Eligian Language Specification

**Version**: 1.5.1
**Last Updated**: 2025-11-17
**Status**: Living Document - Updated with every language feature change

**Recent Changes** (v1.5.1):
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

Reserved keywords that cannot be used as identifiers:

```
action      at          timeline    for         if
else        break       continue    from        as
import      layout      styles      provider    true
false       on          event       topic       endable
library     private     sequence    stagger     in
using       with        const       null
```

**Note**: Keywords are organized by category:
- **Action keywords**: `action`, `endable`, `private`
- **Control flow**: `for`, `if`, `else`, `break`, `continue`, `in`
- **Timeline keywords**: `timeline`, `at`, `sequence`, `stagger`, `using`, `with`
- **Import keywords**: `import`, `layout`, `styles`, `provider`, `library`, `from`, `as`
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

**Default**: If no unit is specified, value is treated as milliseconds.

---

## 3. Program Structure

### 3.1 File Types

Eligian supports two types of source files:

1. **Program Files** - Complete applications with timelines and resources
2. **Library Files** - Reusable action collections (Feature 023)

#### 3.1.1 Program Files

An Eligian program consists of zero or more program statements in any order:

```eligian
Program := ProgramStatement*

ProgramStatement := ImportStatement | ProgramElement

ProgramElement := ActionDefinition | Timeline | VariableDeclaration

ImportStatement := DefaultImport | NamedImport | LibraryImport
```

**Key Points**:
- **Flexible Ordering**: Imports, constants, actions, and timelines can appear in any order
- **No Strict Grouping**: You can mix imports with other declarations as needed
- **Can import from libraries**: Programs can import actions from library files

**Example**:

```eligian
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
```

**Import Types**:
- `layout` - HTML layout file (auto-assigned to `layoutTemplate`)
- `styles` - CSS stylesheet file (registered for CSS validation/completion)
- `provider` - Media file (auto-assigned to timeline provider source)

**Examples**:

```eligian
// Default imports - no 'import' or 'from' keywords
layout "./layout.html"      // Assigns to layoutTemplate property
styles "./main.css"         // Registers CSS for completions
provider "./video.mp4"      // Assigns to timelineProvider.source
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

---

## 5. Event Actions

Event actions are special action definitions that execute in response to runtime events fired by the application or the Eligius timeline engine. Unlike regular actions that are explicitly invoked in timelines, event actions are triggered automatically when their associated event occurs.

### 5.1 Event Action Definition

**Syntax** (BNF notation):
```bnf
on event <eventName> (topic <topicName>)? action <ActionName> ( <parameters>? ) [
  <operations>*
]
```

Where:
- `<eventName>` is a string literal (e.g., `"language-change"`, `"click"`)
- `(topic <topicName>)?` is optional - use parentheses to indicate optionality in BNF
- `<ActionName>` is an identifier starting with an uppercase letter
- `<parameters>?` is an optional comma-separated parameter list
- `[` and `]` are **literal square brackets** in the Eligian syntax (not EBNF notation)

**Components**:
- **eventName**: String literal - the event name to listen for (e.g., "click", "language-change", "timeline-complete")
- **topicName**: Optional string literal - namespace for the event (allows multiple handlers for same event name in different contexts)
- **ActionName**: Identifier - name of the event action (should start with uppercase letter per convention)
- **parameters**: Optional parameter list - receives data from `eventArgs` array at runtime
- **operations**: Operation sequence - executes when event fires

**Note on Notation**: In this specification, we use `(...)` or `?` to indicate optional elements in BNF notation. The square brackets `[` and `]` in the syntax above are **literal characters** in Eligian code, not BNF notation.

**Example**:
```eligian
/**
 * Handle language change events
 * @param languageCode The new language code (e.g., "en", "fr", "de")
 */
on event "language-change" action HandleLanguageChange(languageCode: string) [
  selectElement("#language-display")
  setElementContent(languageCode)
  addClass("highlight")
  log("Language changed to: " + languageCode)
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
// Handle click events in navigation context
on event "click" topic "navigation" action HandleNavClick(targetId: string) [
  selectAll(".nav-item")
  removeClass("active")
  selectElement(targetId)
  addClass("active")
]

// Handle click events in form context - same event, different topic
on event "click" topic "form" action HandleFormClick(formId: string, buttonType: string) [
  selectElement(formId)
  if (buttonType == "submit") {
    addClass("submitting")
    selectElement("#form-status")
    setElementContent("Submitting...")
  } else if (buttonType == "cancel") {
    removeClass("editing")
    selectElement("#form-status")
    setElementContent("Cancelled")
  }
]
```

**Key Points**:
- **Optional**: Topics are optional - omit the `topic "<name>"` clause for global event handlers
- **Same event, multiple handlers**: Multiple event actions can listen to the same event name if they use different topics
- **Topic collision**: Two event actions with the same event name AND same topic (or both no topic) is an error
- **Dispatching**: At runtime, events can be fired with or without a topic - only matching handlers execute

### 5.3 Parameter Mapping

Event action parameters map to the `eventArgs` array passed when the event is fired at runtime:

**Parameter Position Mapping**:
```eligian
// Event action definition
on event "user-login" action HandleUserLogin(userId: string, userName: string, userRole: string) [
  // userId = eventArgs[0]
  // userName = eventArgs[1]
  // userRole = eventArgs[2]
  selectElement("#user-id")
  setElementContent(userId)
  selectElement("#user-name")
  setElementContent(userName)
  selectElement("#user-role")
  setElementContent(userRole)
]
```

**Runtime Dispatch**:
```javascript
// JavaScript code that fires the event
eventbus.broadcast("user-login", ["user123", "John Doe", "admin"]);
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
on event "click" action HandleClick() [...]
on event "data-sync" action HandleDataSync() [...]

// ⚠️ Discouraged - lowercase (but not an error)
on event "click" action handleClick() [...]
```

**Rationale**: This convention makes it clear at a glance which actions are event-driven vs. explicitly called in timelines.

### 5.5 Common Event Names

The following events are commonly used with Eligius:

**Timeline Events** (fired by Eligius engine):
- `timeline-play` - Timeline starts playing
- `timeline-pause` - Timeline is paused
- `timeline-stop` - Timeline is stopped
- `timeline-complete` - Timeline completes playback
- `timeline-seek` - Timeline position changes

**Application Events** (fired by application code):
- `language-change` - Application language changes
- `user-login` / `user-logout` - User authentication
- `data-sync` - Data synchronization completes
- `click` - Custom click event (often used with topics)
- `hover` - Custom hover event
- `submit` - Custom submit event

**Note**: Event names are not restricted - you can fire and handle any custom event names your application requires.

### 5.6 Validation Rules

**Empty Event Name**:
```eligian
on event "" action HandleEmpty() [...]
// ❌ ERROR: Event name cannot be an empty string
```

**Empty Topic String**:
```eligian
on event "click" topic "" action HandleClick() [...]
// ❌ ERROR: Event topic cannot be an empty string. Either provide a topic name or omit the topic clause entirely.
```

**Duplicate Event Action**:
```eligian
on event "click" action HandleClick() [...]
on event "click" action HandleClickAgain() [...]
// ❌ ERROR: Event action for event 'click' (no topic) already defined
```

**Topic Collision**:
```eligian
on event "click" topic "nav" action HandleNavClick() [...]
on event "click" topic "nav" action AnotherNavClick() [...]
// ❌ ERROR: Event action for event 'click' topic 'nav' already defined
```

**Name Collision with Built-in Operations**:
Event actions cannot have names that conflict with built-in operations:
```eligian
on event "click" action selectElement() [...]
// ❌ ERROR: Event action name 'selectElement' conflicts with built-in operation
```

### 5.7 Control Flow in Event Actions

Event actions support the full set of control flow statements:

**If/Else**:
```eligian
on event "data-sync" action HandleDataSync(syncStatus: string, itemCount: number) [
  selectElement("#sync-status")
  setElementContent(syncStatus)
  if (syncStatus == "success") {
    selectElement("#sync-indicator")
    addClass("success")
    removeClass("error")
    selectElement("#sync-count")
    setElementContent(itemCount)
  } else {
    selectElement("#sync-indicator")
    addClass("error")
    removeClass("success")
  }
]
```

**For Loops**:
```eligian
on event "items-loaded" action HandleItemsLoaded(items: array) [
  for (item in items) {
    selectElement(".template")
    clone()
    setElementContent(@@currentItem.name)
    addClass("loaded")
  }
]
```

**Break/Continue**:
```eligian
on event "batch-process" action HandleBatchProcess(items: array) [
  for (item in items) {
    if (@@currentItem.skip) {
      continue
    }
    if (@@currentItem.error) {
      log("Error encountered, stopping batch")
      break
    }
    processItem(@@currentItem)
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

The Eligian compiler performs compile-time validation of event names against a registry of 43 known Eligius events. This catches typos and undefined event names before runtime.

**Validation Features**:
- Event names are validated against metadata from `@eligius/event-metadata` package
- Invalid event names produce compile errors with "Did you mean?" suggestions using Levenshtein distance
- Argument count validation: ensures event action parameter count matches event metadata
- Type annotation validation: verifies parameter types match event argument types

**Example - Invalid Event Name**:
```eligian
// ❌ ERROR: Unknown event name 'langauge-change' (Did you mean: 'language-change'?)
on event "langauge-change" action HandleLanguageChange(languageCode: string) [
  log(languageCode)
]
```

**Example - Argument Count Mismatch**:
```eligian
// ❌ ERROR: Event 'before-request-video-url' expects 3 arguments, but action has 2 parameters
on event "before-request-video-url" action HandleVideoURL(index: number, position: number) [
  log("Video request")
]
```

**Valid Eligius Events** (43 total - selection shown):
```
Timeline Events:
  timeline-play, timeline-pause, timeline-complete, timeline-reset

Video Events:
  before-request-video-url, video-loaded, video-error, video-play, video-pause

Navigation Events:
  slide-navigation, before-slide-navigation, after-slide-navigation

System Events:
  language-change, theme-change, resize, orientation-change

Custom Events:
  click, focus, blur, submit, change, input, keydown, keyup, scroll
  (and 20+ more...)
```

**Implementation Details**:
- Validation occurs in `eligian-validator.ts:checkEventActionEventName()`
- Event metadata loaded from `packages/language/src/completion/metadata/timeline-events.generated.ts`
- Levenshtein distance ≤ 2 generates "Did you mean?" suggestions
- Error code: `'unknown_event_name'`

### 5.11 IDE Support and Code Completion (Feature 030)

The VS Code extension provides intelligent code completion for event actions, auto-generating complete action skeletons from event metadata.

**Trigger**: Type `on event ` and press **Ctrl+Space** (or Cmd+Space on macOS)

**What You Get**:
- Dropdown list of all 43 Eligius events with descriptions
- Selecting an event auto-generates a complete action skeleton:
  - Action name in camelCase convention (e.g., `handleLanguageChange`)
  - Parameters with inferred types from event metadata
  - Empty operation body ready for implementation
  - JSDoc comment placeholder for documentation

**Example Workflow**:
```eligian
// 1. Type this and press Ctrl+Space
on event "|"

// 2. Dropdown shows 43 events:
//    - language-change: Fires when language changes (param: languageCode: string)
//    - timeline-complete: Fires when timeline finishes ()
//    - before-request-video-url: Fires before video URL request (params: index: number, ...)
//    ... 40 more ...

// 3. Select "language-change" and get:
/**
 * Handle language-change event
 * @param languageCode
 */
on event "language-change" action handleLanguageChange(languageCode: string) [
  // TODO: Implement event handler
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

---

## 6. Timelines

### 6.1 Timeline Declaration

```eligian
timeline <name> in <containerSelector> using <provider> [from <source>] {
  <events>*
}
```

**Parameters**:
- `name`: String literal - timeline identifier
- `containerSelector`: String literal - CSS selector for container element
- `provider`: Timeline provider type
- `source`: (Optional) Source file for video/audio providers

**Providers**:
- `video` - Video element (requires `from` source)
- `audio` - Audio element (requires `from` source)
- `raf` - RequestAnimationFrame loop (no source)
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
```

### 6.2 Timeline Events

#### Timed Events

```eligian
at <start>..<end> <actionCall>
at <start>..<end> <operationCall>
at <start>..<end> <controlFlow>
at <start>..<end> [ <start-ops>* ] [ <end-ops>* ]
```

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
stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn for 2s

// Compiles to:
// at 0s..2s { fadeIn(".item-1") }
// at 0.2s..2.2s { fadeIn(".item-2") }
// at 0.4s..2.4s { fadeIn(".item-3") }
```

### 6.3 Time Expressions

#### Time Literals

```eligian
42          // 42 milliseconds (default unit)
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
```

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
```

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

**Validated Operations**:
- `selectElement("<selector>")`
- `selectAll("<selector>")`

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
- Real-time synchronization with source code

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
DefaultImport   := ('layout' | 'styles' | 'provider') STRING
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
                   '{' TimelineEvent* '}'
Provider        := 'video' | 'audio' | 'raf' | 'custom'

TimelineEvent   := TimedEvent | SequenceBlock | StaggerBlock
TimedEvent      := 'at' TimeRange (NamedAction | InlineAction)
SequenceBlock   := 'sequence' '{' SequenceItem* '}'
StaggerBlock    := 'stagger' TimeExpr Expression 'with' ActionCall 'for' TimeExpr
                 | 'stagger' TimeExpr Expression 'for' TimeExpr
                   '[' Operations ']' '[' Operations ']'

TimeRange       := TimeExpression '..' TimeExpression
TimeExpression  := TimeLiteral | RelativeTimeLiteral | BinaryTimeExpr
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
SystemPropertyRef := '@@' ID
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
| 1.5.1 | 2025-11-17 | **Feature 032 Improvements**: Added nested library dependency documentation (section 3.3.5), library cache invalidation documentation (section 3.3.6), parameter count validation for imported actions, library file compilation prevention. Updated CSS path resolution to clarify paths are relative to source file directory (section 12.1). Bug fixes: validator now checks imported action parameter counts, CSS paths resolve correctly for files in subdirectories, library compilation prevented with clear error message. |
| 1.5.0 | 2025-11-13 | **Major Update**: Fixed critical syntax notation issues, added complete documentation for 10+ missing features: Event name validation (Feature 029), event action code completion (Feature 030), CSS class/selector validation (Feature 013), preview CSS support with hot-reload (Feature 011), expanded JSDoc documentation (Feature 020), Typir integration details (Feature 021), comprehensive library file validation (Feature 023). Updated keyword list to include all 11 missing keywords. Verified 1,758 tests passing, 81.72% coverage. Added new sections 5.10, 5.11, 12, 13. |
| 1.4.0 | 2025-11-10 | Added event action support (Feature 028): event action definitions, event topic namespacing, runtime event handling |
| 1.3.1 | 2025-11-06 | Documentation fixes: corrected parameter reference syntax throughout (prefer direct references over `$operationdata` prefix), updated reserved keywords list, fixed grammar summary to include imports and library files |
| 1.3.0 | 2025-11-02 | Added library file support (Feature 023), library import statements, `private` visibility modifier for actions, library-specific validation rules |
| 1.0.0 | 2025-10-21 | Initial specification based on current grammar |

---

**End of Specification**
