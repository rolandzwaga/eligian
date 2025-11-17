# Library File Loading: Quickstart Guide

Welcome! This guide shows you how to use library imports in the Eligian CLI compiler to reuse custom actions across multiple programs. You'll learn how to create libraries, import them, compile with libraries, and handle errors.

## Overview

**Library imports** allow you to:
- Extract reusable actions into separate `.eligian` library files
- Import those actions into other programs or libraries
- Organize complex presentations with modular, maintainable code
- Build layered abstractions with nested library dependencies

Instead of copying action definitions across programs:

```eligian
// ❌ Without libraries - code duplication
timeline "Demo 1" in ".container" using raf {
  at 0s..2s fadeIn(".box", 1000)
}

timeline "Demo 2" in ".container" using raf {
  at 0s..2s fadeIn(".box", 1000)  // Duplicated!
}
```

You create a library once and reuse it:

```eligian
// ✅ With libraries - reusable code
import { fadeIn } from "./animations.eligian"

timeline "Demo 1" in ".container" using raf {
  at 0s..2s fadeIn(".box", 1000)
}

timeline "Demo 2" in ".container" using raf {
  at 0s..2s fadeIn(".box", 1000)  // Same library used
}
```

## Prerequisites

Before using library imports, ensure you have:

- **Eligian CLI compiler** installed and built:
  ```bash
  pnpm run build:cli
  ```

- **Understanding of basic Eligian syntax**:
  - Action definitions
  - Timeline events and operations
  - Type annotations (optional but recommended)

- **Library files with `.eligian` extension** (see "Creating a Library File" below)

- **File system access** (libraries are loaded from disk)

## Basic Usage (User Story 1)

### Creating a Library File

Library files use the `library` keyword at the top level and can contain action definitions:

**File: `lib/animations.eligian`**

```eligian
/**
 * Shared animation library
 *
 * Provides common fade and slide animations for UI elements.
 * Use these actions to create smooth, consistent transitions.
 */
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
 * Fades out an element over a specified duration
 * @param selector CSS selector for target element
 * @param duration Animation duration in milliseconds
 */
action fadeOut(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 0}, duration)
]

/**
 * Slides in an element from the left
 * @param selector CSS selector for target element
 * @param duration Animation duration in milliseconds
 */
action slideInLeft(selector: string, duration: number) [
  selectElement(selector)
  setStyle("transform", "translateX(-100%)")
  animate({transform: "translateX(0)"}, duration)
]

/**
 * Private helper - not importable from other files
 * These are useful for internal library organization.
 * Private actions cannot be imported (encapsulation).
 */
private action cleanupStyles(selector: string) [
  selectElement(selector)
  setStyle("transform", "none")
  setStyle("opacity", "1")
]
```

**Key features**:
- **`library animations`**: Declares this as a library file (required at top)
- **`action` keyword**: Public actions available for import
- **`private action` keyword**: Private actions (not importable from other files)
- **JSDoc comments**: Document your actions with `/** */` and `@param` tags

### Importing from a Library

Import actions into a program using the `import` statement:

**File: `program.eligian`**

```eligian
import { fadeIn, slideInLeft } from "./lib/animations.eligian"

timeline "Presentation" at 0s {
  at 0s..2s fadeIn("#intro", 1000)
  at 2s..5s slideInLeft(".content", 800)
}
```

**Syntax breakdown**:
- `import { ... } from "..."` - Import statement
- `fadeIn, slideInLeft` - Actions to import (comma-separated)
- `"./lib/animations.eligian"` - Relative path to library file
- Actions must be public (not prefixed with `private`)

**Key points**:
- Import paths are **relative** to the importing file's directory
- Use `./` for files in the same directory
- Use `../` to go up one directory
- Paths can use subdirectories: `"./lib/animations.eligian"`, `"../shared/common.eligian"`
- Only imported actions are accessible in the program

### Compiling with Libraries

Compile a program that imports libraries using the CLI:

```bash
# Build the CLI compiler first (one-time)
pnpm --filter @eligian/cli run build:cli

# Compile a program with library imports
node packages/cli/out/index.js program.eligian > output.json

# Verify the output contains the expanded actions
cat output.json | grep fadeIn
```

**What happens during compilation**:
1. CLI reads `program.eligian`
2. Compiler detects `import` statement
3. Compiler loads `./lib/animations.eligian`
4. Compiler parses the library file
5. Compiler resolves imported actions (`fadeIn`, `slideInLeft`)
6. Compiler expands action calls to Eligius operations
7. Compiler outputs JSON with all actions resolved

**Example output** (simplified JSON):

```json
{
  "timelines": [
    {
      "id": "Presentation",
      "events": [
        {
          "startTime": 0,
          "endTime": 2,
          "actions": [
            {
              "action": "requestAction",
              "params": { "actionId": "fadeIn" }
            },
            {
              "action": "startAction",
              "params": { "actionId": "fadeIn", "params": ["#intro", 1000] }
            }
          ]
        }
      ]
    }
  ]
}
```

## Multiple Imports

Import from multiple different libraries in the same program:

**File: `complex-presentation.eligian`**

```eligian
import { fadeIn, slideInLeft } from "./lib/animations.eligian"
import { preload, playSound } from "./lib/audio.eligian"
import { trackScroll, debounce } from "./lib/utils.eligian"

timeline "Complex Presentation" at 0s {
  at 0s preload("background.png")
  at 1s..3s fadeIn("#intro", 1000)
  at 3s playSound("transition.mp3", 0.8)
  at 3s..5s slideInLeft(".content", 800)
  at 6s..8s trackScroll({threshold: 0.5})
}
```

**Best practices**:
- Group related actions into focused libraries (one library per concern)
- Keep imports at the top of your program for clarity
- Use descriptive library names that indicate purpose (`animations.eligian`, not `lib.eligian`)

### Importing Many Actions at Once

If a library has many actions and you want to import them all:

**Not yet supported in Phase 1** - Import specific actions you need:

```eligian
// ✅ Do this - import only what you use
import { fadeIn, fadeOut, slideInLeft } from "./animations.eligian"

// ❌ Not yet - wildcard imports coming in future version
// import * from "./animations.eligian"
```

## Aliased Imports

Rename imported actions using the `as` keyword:

**File: `program.eligian`**

```eligian
import { fadeIn as appear, slideInLeft as enter } from "./lib/animations.eligian"

timeline "Demo" at 0s {
  at 0s..2s appear("#intro", 1000)    // Uses aliased name
  at 2s..5s enter(".content", 800)    // Uses aliased name
}
```

**When to use aliases**:
- Action names conflict with local definitions
- You want shorter or more domain-specific names in your program
- You're adapting a library for a specific context

## Error Handling (User Story 2)

### Missing Library File

If you reference a library file that doesn't exist:

**Error message**:
```
Unknown Error: {
  "_tag": "FileNotFound",
  "message": "Library file not found: './missing.eligian'",
  "hint": "Resolved to: /absolute/path/to/missing.eligian",
  "location": { "line": 1, "column": 8 }
}
```

**How to fix**:
1. Check the import path spelling: `./lib/animations.eligian` vs `./libs/animations.eligian`
2. Verify the file exists on disk: `ls ./lib/animations.eligian` (Unix/macOS) or `dir .\lib\animations.eligian` (Windows)
3. Verify the path is relative to the program file, not the current directory
4. Use forward slashes (`/`) even on Windows for consistency

### Syntax Error in Library

If a library file has invalid Eligian syntax:

**Error message**:
```
Unknown Error: {
  "_tag": "ParseError",
  "message": "Library file has parse errors: './lib/animations.eligian'",
  "hint": "Parse error at line 5, column 10: Expected ']' but got '}'",
  "location": { "line": 1, "column": 8 }
}
```

**How to fix**:
1. Check the library file syntax at the indicated line and column
2. Look for:
   - Missing closing brackets: `[...]`
   - Typos in keywords: `libary` instead of `library`
   - Incorrect action definition syntax
3. Edit the library file to fix the error
4. Recompile the program

**Example broken library**:

```eligian
library animations

action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
}  // ❌ Wrong bracket type! Should be ] not }
```

### Circular Dependencies

If libraries import each other in a circular way:

**Error message**:
```
Unknown Error: {
  "_tag": "CircularDependency",
  "message": "Circular dependency detected: a.eligian → b.eligian → a.eligian",
  "hint": "Libraries cannot import each other in a cycle",
  "location": { "line": 1, "column": 8 }
}
```

**How to fix**:
1. Identify the dependency chain shown in the error
2. Break the cycle by extracting common code to a third library:

**Before (circular)**:
```eligian
// a.eligian
import { helperB } from "./b.eligian"
action actionA() [ helperB() ]

// b.eligian
import { helperA } from "./a.eligian"  // ❌ Circular!
action actionB() [ helperA() ]
```

**After (fixed)**:
```eligian
// common.eligian
action shared() [ /* ... */ ]

// a.eligian
import { shared } from "./common.eligian"
action actionA() [ shared() ]

// b.eligian
import { shared } from "./common.eligian"
action actionB() [ shared() ]
```

### Importing Non-Public Actions

If you try to import a `private` action:

**Error message**:
```
Unknown Error: {
  "_tag": "ValidationError",
  "message": "Cannot import private action 'cleanupStyles' from './lib/animations.eligian'",
  "hint": "Only public actions can be imported. Define without 'private' keyword.",
  "location": { "line": 1, "column": 10 }
}
```

**How to fix**:
- Remove `private` keyword from the action definition in the library if you want to export it
- Or remove the action from your import statement if it's meant to be internal to the library

## Nested Dependencies (User Story 3)

Libraries can import other libraries, enabling layered abstractions:

**Dependency chain**:
```
program.eligian
└── animations.eligian
    ├── transitions.eligian
    └── easing.eligian
```

**File: `lib/easing.eligian`**

```eligian
library easing

action easeInQuad(value: number) [
  // Internal easing calculation
]

action easeOutQuad(value: number) [
  // Internal easing calculation
]
```

**File: `lib/transitions.eligian`**

```eligian
import { easeInQuad, easeOutQuad } from "./easing.eligian"

library transitions

action smoothFadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)  // Uses easing internally
]
```

**File: `lib/animations.eligian`**

```eligian
import { smoothFadeIn } from "./transitions.eligian"

library animations

action advancedFadeIn(selector: string) [
  smoothFadeIn(selector, 2000)
]
```

**File: `program.eligian`**

```eligian
import { advancedFadeIn } from "./lib/animations.eligian"

timeline "Demo" at 0s {
  at 0s..2s advancedFadeIn("#intro")
}
```

**How nested imports work**:
1. `program.eligian` imports `animations.eligian`
2. Compiler loads `animations.eligian`
3. Compiler detects import in `animations.eligian`
4. Compiler loads `transitions.eligian`
5. Compiler detects import in `transitions.eligian`
6. Compiler loads `easing.eligian`
7. All libraries are linked and available
8. Program can use actions from any level (`advancedFadeIn`)

**Key rules**:
- Each library can import other libraries
- Actions from libraries-of-libraries are available (transitively)
- Private actions remain private at each level (not exported through chains)
- Depth limit: up to 10 levels of nesting (very deep nesting is rare and not recommended)

## Performance

### Typical Compilation Times

For a typical project structure:

| Configuration | Time | Notes |
|---|---|---|
| 1 program + 1 library | <500ms | Single library import |
| 1 program + 5 libraries | <1000ms | Multiple independent libraries |
| Nested chain (3 levels) | <800ms | Program → lib A → lib B → lib C |
| Deep nesting (10 levels) | <2000ms | Maximum supported depth |

All times measured on typical hardware (2020+ CPU, SSD storage).

### Performance Tips

- **Keep libraries small**: Aim for <100KB per library file
  - Smaller files parse faster
  - Easier to maintain and test
  - Better for reusability (focused scope)

- **Minimize nesting**: 3 levels is typical, 5 is maximum recommended
  - Each level adds parsing overhead
  - Circular dependency detection adds some cost
  - Flat structure (1 level of imports) is fastest

- **Cache compilation output**: If you're compiling the same program repeatedly, store the JSON output
  - Recompiling takes <2 seconds anyway, but caching can help in CI/CD

- **Use small test programs**: When debugging library issues, create minimal test programs
  - Smaller programs compile faster (easier iteration)
  - Easier to identify which library causes issues

## Troubleshooting

### Problem: "Could not resolve reference to ActionDefinition"

**Cause**: Library file wasn't loaded into the compiler workspace (rare, usually means a bug)

**Solution**:
1. Verify the import path is correct
2. Check library file syntax (`pnpm --filter @eligian/language run check` to validate)
3. Verify the action is public (not `private`) in the library
4. Recompile from scratch: `rm -rf packages/language/out && pnpm run build`

### Problem: Library changes aren't reflected in compiled output

**Cause**: Compiled output cached from previous run

**Solution**:
1. Always recompile after changing a library: `node packages/cli/out/index.js program.eligian`
2. No caching occurs between runs (each run reads fresh files from disk)

### Problem: Import statement shows red squiggly in VS Code extension

**Cause**: IDE validation caught an issue

**Solution**:
1. Hover over the red squiggly to see the error message
2. Check that:
   - Library file exists at the path shown
   - Library file is valid Eligian syntax
   - Imported actions are defined and public in the library

### Problem: Compilation is very slow (>5 seconds)

**Cause**: Possible large library files or very deep nesting

**Solution**:
1. Check library file sizes: `ls -lh *.eligian lib/*.eligian`
2. If any file is >200KB, consider splitting into smaller libraries
3. Check nesting depth: Count the chain of imports
4. Reduce nesting if possible (reorganize to flatter structure)

## Best Practices

### Library Organization

**Organize by domain, not by shared functions**:

```
lib/
├── animations/       # ✅ Domain-focused
│   ├── animations.eligian
│   └── transitions.eligian
├── interactions/     # ✅ Domain-focused
│   └── interactions.eligian
└── utils/            # ✅ Shared utilities
    └── helpers.eligian
```

Not:
```
lib/
├── fade.eligian      # ❌ Too granular
├── slide.eligian     # ❌ Too granular
└── scale.eligian     # ❌ Too granular
```

**Library sizes**:
- **Too small** (<10 lines): Consider grouping with related actions
- **Just right** (10-100 lines): Sweet spot for reusability and maintainability
- **Getting large** (100-500 lines): Consider splitting by concern
- **Too large** (>1000 lines): Definitely split into multiple libraries

### Import Statements

**Place imports at the top**:
```eligian
import { fadeIn, slideOut } from "./lib/animations.eligian"
import { preload } from "./lib/media.eligian"
import { track } from "./lib/analytics.eligian"

// Then define rest of program
timeline "Demo" at 0s { ... }
```

**Not scattered throughout** (avoid):
```eligian
timeline "Demo" at 0s { ... }

import { fadeIn } from "./lib/animations.eligian"  // ❌ Place at top!
```

### Action Definition

**Use type annotations for clarity**:
```eligian
// ✅ Clear types help library users
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

// Less clear without types
action fadeIn(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**Document with JSDoc comments**:
```eligian
/**
 * Fades in an element with a smooth transition
 *
 * @param selector CSS selector for the target element
 * @param duration How long the fade takes in milliseconds
 */
action fadeIn(selector: string, duration: number) [ ... ]
```

Hover over action calls in VS Code to see this documentation.

### Encapsulation

**Mark internal helpers as `private`**:
```eligian
library animations

// Public - library users can import this
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  setupAnimation()      // Uses private helper
  animate({opacity: 1}, duration)
]

// Private - only used internally in this library
private action setupAnimation() [
  setStyle("will-change", "opacity")
]
```

**Benefits**:
- Users see only the intended public API
- You can refactor private helpers without breaking dependent code
- Clear separation between internal and external interfaces

### Circular Dependency Prevention

**Design for single-direction dependencies**:

```eligian
// ✅ Good structure - dependencies flow downward
program.eligian
  └── ui-animations.eligian
      └── easing-library.eligian
          └── math-utils.eligian
```

Not:
```eligian
// ❌ Avoid bidirectional dependencies
program.eligian
  ├── animations.eligian
  │   └── utils.eligian
  │       └── animations.eligian (circular!)
```

## Next Steps

### Common Tasks

**Create a new library**:
1. Create file `lib/my-library.eligian`
2. Start with: `library my-library`
3. Define actions with `action` keyword
4. Optionally mark internal helpers with `private`
5. Use in programs with: `import { actionName } from "./lib/my-library.eligian"`

**Use an existing library**:
1. Find the library file (e.g., `lib/animations.eligian`)
2. Review the action names and parameters (check JSDoc comments)
3. Add import statement to your program
4. Call imported actions in timelines or other actions

**Debug import errors**:
1. Check the import path is correct (relative to program file)
2. Verify library file exists (`ls lib/animations.eligian`)
3. Verify library file syntax (`pnpm run check` in language package)
4. Check that imported actions are public (not `private`)

### Examples

The repository includes example libraries:

- **`examples/libraries/animations.eligian`**: Common fade, slide, scale, and rotate animations
- **`examples/libraries/utils.eligian`**: Utility actions for common operations
- **Example programs**: Use `pnpm --filter @eligian/language run test` to see integration tests with libraries

### Learning Resources

- **Feature Specification**: `specs/032-library-file-loading/spec.md`
- **Implementation Plan**: `specs/032-library-file-loading/plan.md`
- **Data Model**: `specs/032-library-file-loading/data-model.md`
- **Type System**: `packages/language/src/type-system/README.md` (type annotations)
- **JSDoc Comments**: `specs/020-jsdoc-style-comments/quickstart.md` (action documentation)

## Summary

Library imports enable modular Eligian programs:

1. **Create libraries** with `library` keyword and public/private actions
2. **Import actions** with `import { name } from "./path.eligian"`
3. **Use imported actions** in timelines and other actions (identical syntax)
4. **Nest libraries** to create layered abstractions (library imports library)
5. **Handle errors** with clear error messages for missing files, syntax errors, and cycles
6. **Organize code** by domain with focused, reusable libraries

By following the patterns in this guide, you can build clean, maintainable Eligius presentations with shared, reusable action definitions across projects.
