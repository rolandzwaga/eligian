# Quickstart: Library Files with Action Imports

**Feature**: Library Files with Action Imports (023)
**Purpose**: Quick reference for creating and using Eligian library files
**Target Audience**: Eligian developers creating reusable action libraries

---

## TL;DR

**Create a library**:
```eligian
library animations

action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

private action resetOpacity(selector: string) [
  selectElement(selector)
  animate({opacity: 0}, 0)
]
```

**Import and use**:
```eligian
import { fadeIn } from "./animations.eligian"

styles "./styles.css"

timeline "Demo" at 0s {
  at 0s fadeIn("#title", 1000)
}
```

---

## Creating Library Files

### 1. Basic Library Structure

Every library file must:
- Start with `library` keyword and a name
- Contain at least one action
- Use `.eligian` file extension

```eligian
library myLibrary

action myAction() [
  // Action body
]
```

### 2. Library Constraints

Libraries **CANNOT** contain:
- Timelines
- Style imports
- Constant declarations
- Import statements

Libraries **CAN** contain:
- Regular actions (`action ...`)
- Endable actions (`endable action ...`)
- Private actions (`private action ...`)

### 3. Public vs Private Actions

**Public actions** (default):
- Can be imported by other files
- Omit `private` keyword

```eligian
library utils

// Public - can be imported
action capitalize(text: string) [
  // ...
]
```

**Private actions**:
- Cannot be imported
- Only usable within the same library
- Use `private` keyword

```eligian
library utils

// Private - internal helper only
private action validateInput(text: string) [
  // ...
]

// Public action using private helper
action safeCapitalize(text: string) [
  validateInput(text)  // OK - same library
  capitalize(text)
]
```

---

## Importing from Libraries

### 1. Basic Import Syntax

```eligian
import { actionName } from "./path/to/library.eligian"
```

**Rules**:
- Use relative paths
- Must include `.eligian` extension
- Curly braces required (even for single import)
- `from` keyword required

### 2. Multiple Imports

Import multiple actions from same library:

```eligian
import { fadeIn, fadeOut, slideIn } from "./animations.eligian"
```

### 3. Import with Aliases

Rename imported actions to avoid conflicts:

```eligian
import { fadeIn as animateFadeIn } from "./animations.eligian"
import { fadeIn as transitionFadeIn } from "./transitions.eligian"

timeline "Demo" at 0s {
  at 0s animateFadeIn("#box", 1000)
  at 2s transitionFadeIn("#title", 500)
}
```

### 4. Import from Multiple Libraries

```eligian
import { fadeIn, fadeOut } from "./animations.eligian"
import { debounce, throttle } from "./utils.eligian"
import { validateEmail } from "./validation.eligian"
```

---

## Using Imported Actions

Imported actions work **identically** to locally-defined actions:

```eligian
import { fadeIn } from "./animations.eligian"

// Can be used anywhere local actions can be used

// In timelines
timeline "Test" at 0s {
  at 0s fadeIn("#box", 1000)
}

// In control flow
for (item in items) {
  if (@@currentItem.visible) {
    fadeIn(@@currentItem.selector, 500)
  }
}

// In sequences
fadeIn("#title", 1000) for 2s

// In staggers
stagger 200ms items with fadeIn(@@item.selector, 1000) for 1s
```

---

## Common Patterns

### Pattern 1: Animation Library

```eligian
library animations

/**
 * Fades in an element
 * @param selector CSS selector
 * @param duration Animation duration in milliseconds
 */
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

/**
 * Fades out an element
 * @param selector CSS selector
 * @param duration Animation duration in milliseconds
 */
action fadeOut(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 0}, duration)
]

/**
 * Slides in from left
 * @param selector CSS selector
 * @param duration Animation duration in milliseconds
 */
action slideInLeft(selector: string, duration: number) [
  selectElement(selector)
  animate({transform: "translateX(0)"}, duration)
]
```

**Usage**:
```eligian
import { fadeIn, fadeOut, slideInLeft } from "./animations.eligian"

timeline "Presentation" at 0s {
  at 0s fadeIn("#title", 1000)
  at 2s slideInLeft("#content", 800)
  at 10s fadeOut("#outro", 500)
}
```

---

### Pattern 2: Utility Library with Private Helpers

```eligian
library utils

/**
 * Private helper - validates selector format
 */
private action validateSelector(selector: string) [
  // Validation logic
]

/**
 * Safely selects element with validation
 * @param selector CSS selector to validate and select
 */
action safeSelect(selector: string) [
  validateSelector(selector)
  selectElement(selector)
]

/**
 * Safely adds class with validation
 * @param selector CSS selector
 * @param className Class name to add
 */
action safeAddClass(selector: string, className: string) [
  validateSelector(selector)
  selectElement(selector)
  addClass(className)
]
```

**Usage**:
```eligian
import { safeSelect, safeAddClass } from "./utils.eligian"
// import { validateSelector } from "./utils.eligian"  // ❌ ERROR: Cannot import private

timeline "Safe Demo" at 0s {
  at 0s safeSelect("#box")
  at 1s safeAddClass("#box", "active")
}
```

---

### Pattern 3: Nested Library Paths

**Directory structure**:
```
project/
├── src/
│   ├── main.eligian
│   └── timelines/
│       └── intro.eligian
└── shared/
    └── libraries/
        ├── animations.eligian
        └── utils.eligian
```

**Import from nested path**:
```eligian
// File: src/timelines/intro.eligian
import { fadeIn } from "../../shared/libraries/animations.eligian"
import { debounce } from "../../shared/libraries/utils.eligian"

timeline "Intro" at 0s {
  at 0s fadeIn("#title", 1000)
}
```

---

## Error Scenarios

### Error 1: Importing Private Action

```eligian
// lib.eligian
library lib
private action privateHelper() [...]

// main.eligian
import { privateHelper } from "./lib.eligian"
// ❌ ERROR: Cannot import private action 'privateHelper' from library
```

**Fix**: Remove import or make action public (remove `private` keyword)

---

### Error 2: Missing Library File

```eligian
import { fadeIn } from "./missing.eligian"
// ❌ ERROR: Library file not found: ./missing.eligian
```

**Fix**: Check file path and ensure library file exists

---

### Error 3: Action Not Found in Library

```eligian
import { nonExistent } from "./animations.eligian"
// ❌ ERROR: Action 'nonExistent' not found in library './animations.eligian'
```

**Fix**: Check action name spelling or add action to library

---

### Error 4: Name Collision with Local Action

```eligian
import { fadeIn } from "./animations.eligian"

action fadeIn() [...]  // ❌ ERROR: Action 'fadeIn' is already defined locally
```

**Fix**: Use alias for import
```eligian
import { fadeIn as libFadeIn } from "./animations.eligian"
```

---

### Error 5: Name Collision with Built-in Operation

```eligian
library bad

action selectElement() [...]  // ❌ ERROR: Action name 'selectElement' conflicts with built-in operation
```

**Fix**: Rename action to avoid conflict

---

### Error 6: Private in Program File

```eligian
// main.eligian (program file)
private action myAction() [...]
// ❌ ERROR: Visibility modifier 'private' can only be used in library files
```

**Fix**: Remove `private` keyword or move action to library file

---

## IDE Features

### Auto-Completion

When typing import statements, IDE suggests available public actions:

```eligian
import { f| } from "./animations.eligian"
// Suggestions: fadeIn, fadeOut (private actions not shown)
```

### Hover Documentation

Hovering over imported action shows JSDoc documentation from library:

```eligian
import { fadeIn } from "./animations.eligian"

timeline "Test" at 0s {
  at 0s fadeIn("#box", 1000)
        ^-- Hover shows: Fades in an element
            @param selector CSS selector
            @param duration Animation duration in milliseconds
}
```

### Go-to-Definition

Ctrl+Click (or Cmd+Click) on imported action navigates to library file:

```eligian
import { fadeIn } from "./animations.eligian"

timeline "Test" at 0s {
  at 0s fadeIn("#box", 1000)
        ^-- Ctrl+Click jumps to fadeIn definition in animations.eligian
}
```

---

## Best Practices

### ✅ DO

- **Use descriptive library names**: `library animations` not `library lib1`
- **Document all public actions**: Use JSDoc comments for better IDE experience
- **Keep libraries focused**: Animation actions in one library, utilities in another
- **Mark implementation details as private**: Hide internal helpers with `private` keyword
- **Use relative paths**: `"./animations.eligian"` not absolute paths

### ❌ DON'T

- **Don't mix concerns**: Don't put animations and validation in same library
- **Don't make everything public**: Mark internal helpers as `private`
- **Don't create circular dependencies**: Library A importing Library B importing Library A
- **Don't use built-in operation names**: Rename actions that conflict with built-ins
- **Don't forget file extensions**: Use `"./lib.eligian"` not `"./lib"`

---

## Troubleshooting

### Issue: "Library file not found"

**Solution**: Check import path is relative to current file
```eligian
// ❌ Wrong
import { fadeIn } from "animations.eligian"  // No ./ prefix

// ✅ Correct
import { fadeIn } from "./animations.eligian"
```

---

### Issue: "Action not found in library"

**Solution**: Verify action name spelling and that it exists in library
```bash
# Check library file contents
cat ./animations.eligian | grep "action fadeIn"
```

---

### Issue: "Cannot import private action"

**Solution**: Either:
1. Make action public (remove `private` keyword)
2. Move consuming code into same library
3. Create public wrapper action that calls private action

---

### Issue: IDE not showing completions

**Solution**: Ensure:
1. File is valid `.eligian` syntax
2. Library file is saved (not just in editor buffer)
3. VS Code Eligian extension is active

---

## Further Reading

- [spec.md](./spec.md) - Complete feature specification
- [plan.md](./plan.md) - Implementation plan and technical details
- [data-model.md](./data-model.md) - AST structures and validation rules
- [LANGUAGE_SPEC.md](../../LANGUAGE_SPEC.md) - Complete Eligian language specification

---

**Last Updated**: 2025-11-02
**Feature Status**: ✅ Design Complete - Ready for Implementation
