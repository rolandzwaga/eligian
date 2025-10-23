# Quick Start: Unified Custom Action and Operation Call Syntax

**Feature**: 006-currently-a-custom
**Date**: 2025-01-23
**Audience**: Eligian DSL users

---

## Overview

Custom actions can now be called using the same syntax as built-in operations! No more special curly brace syntax - just call actions directly in timeline events.

---

## Before vs After

### Old Syntax (Deprecated)

```eligian
action fadeIn(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

timeline "demo" using raf {
  at 0s..5s { fadeIn(".title", 1000) }    // ❌ Old: Braces required
  at 2s..7s { fadeOut(".title", 500) }
}
```

### New Syntax (Recommended)

```eligian
action fadeIn(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

timeline "demo" using raf {
  at 0s..5s fadeIn(".title", 1000)        // ✅ New: No braces needed
  at 2s..7s fadeOut(".title", 500)
}
```

---

## Basic Usage

### 1. Define Custom Actions

Custom actions are defined at the file level (not inside timelines):

```eligian
// Regular action
action showElement(selector) [
  selectElement(selector)
  addClass("visible")
]

// Endable action (with start and end operations)
action pulse(selector, duration) [
  selectElement(selector)
  addClass("pulsing")
] [
  removeClass("pulsing")
]
```

### 2. Call Actions in Timeline Events

Call actions just like you would call operations - no special syntax:

```eligian
timeline "main" using video from "video.mp4" {
  at 0s..5s showElement(".intro")

  at 2s..7s pulse(".logo", 5000)

  at 10s..15s [
    showElement(".section1")
    showElement(".section2")
  ]
}
```

### 3. Mix Actions with Built-In Operations... Wait, You Can't!

**Important**: Operations cannot be called directly in timeline events. You must wrap them in actions.

```eligian
timeline "demo" using raf {
  at 0s..5s selectElement(".box")    // ❌ ERROR: selectElement is an operation
}
```

**Error message**:
```
Operation 'selectElement' cannot be used directly in timeline events.
Define an action that calls this operation, then call the action.
```

**Fix**: Wrap in an action:
```eligian
action select(selector) [
  selectElement(selector)
]

timeline "demo" using raf {
  at 0s..5s select(".box")    // ✅ Works: Calls custom action
}
```

---

## Advanced Usage

### Sequence Blocks

```eligian
action intro() [ /* ... */ ]
action main() [ /* ... */ ]
action outro() [ /* ... */ ]

timeline "slides" using raf {
  sequence {
    intro() for 5s
    main() for 10s
    outro() for 3s
  }
}
```

### Stagger Blocks

```eligian
action fadeInItem(item) [
  selectElement(@@item)
  addClass("visible")
]

timeline "list" using raf {
  stagger 200ms [".item1", ".item2", ".item3"] with fadeInItem() for 2s
}
```

### Inline Actions (Still Supported)

You can still define actions inline within timeline events:

```eligian
timeline "demo" using raf {
  at 0s..5s [
    selectElement(".box")
    addClass("active")
  ] [
    removeClass("active")
  ]
}
```

---

## Passing Arguments

Custom actions support all argument types:

### String Arguments
```eligian
fadeIn(".title", 1000)
```

### Variable References
```eligian
const DURATION = 1000

timeline "demo" using raf {
  at 0s..5s fadeIn(".title", @DURATION)
}
```

### Expressions
```eligian
fadeIn(".title", 500 + 500)
```

### Object Literals
```eligian
action animateProps(selector, props, duration) [
  selectElement(selector)
  animate(props, duration)
]

timeline "demo" using raf {
  at 0s..5s animateProps(".box", {opacity: 1, scale: 1.2}, 1000)
}
```

---

## Error Handling

### Unknown Action

```eligian
timeline "demo" using raf {
  at 0s..5s fadeInnn(".title", 1000)
}
```

**Error**:
```
Unknown action: fadeInnn
Did you mean: fadeIn?
```

### Name Collision with Operation

```eligian
action selectElement() [    // ❌ ERROR
  // ...
]
```

**Error**:
```
Cannot define action 'selectElement': name conflicts with built-in operation
Choose a different name for this action
```

### Wrong Argument Count

```eligian
action fadeIn(selector, duration) [ /* ... */ ]

timeline "demo" using raf {
  at 0s..5s fadeIn(".title")    // ❌ ERROR: Missing duration argument
}
```

**Error**:
```
Action 'fadeIn' expects 2 arguments, but got 1
```

---

## Migration Guide

### Step 1: Remove Braces from Action Calls

**Find**:
```eligian
{ actionName(args) }
```

**Replace with**:
```eligian
actionName(args)
```

### Step 2: Update Sequence Blocks

**Before**:
```eligian
sequence {
  { intro() } for 5s
  { main() } for 10s
}
```

**After**:
```eligian
sequence {
  intro() for 5s
  main() for 10s
}
```

### Step 3: Update Stagger Blocks

**Before**:
```eligian
stagger 200ms items with { fadeIn() } for 2s
```

**After**:
```eligian
stagger 200ms items with fadeIn() for 2s
```

### Step 4: Test Compilation

```bash
# Compile your DSL file
npx eligian-cli compile my-timeline.eligian

# Check for deprecation warnings
# Old syntax will show: "Deprecated syntax: Remove braces around action call"
```

---

## Best Practices

### 1. Use Descriptive Action Names

```eligian
// ✅ Good: Clear what action does
action fadeInAndScale(selector, duration) [ ... ]

// ❌ Bad: Vague, could collide with operations
action fade(selector) [ ... ]
```

### 2. Avoid Operation Name Conflicts

Check the [operation registry](../packages/language/src/compiler/operations/registry.generated.ts) for reserved names.

**Reserved operation names** (48 total):
- `addClass`, `removeClass`, `toggleClass`
- `selectElement`, `selectAll`, `deselectAll`
- `animate`, `wait`, `log`
- ... and 40 more

### 3. Group Related Actions

```eligian
// UI visibility actions
action show(selector) [ ... ]
action hide(selector) [ ... ]
action toggle(selector) [ ... ]

// Animation actions
action fadeIn(selector, duration) [ ... ]
action fadeOut(selector, duration) [ ... ]
action slideIn(selector, duration) [ ... ]
```

### 4. Use Endable Actions for Reversible Effects

```eligian
// ✅ Good: Endable action for temporary state
action highlight(selector) [
  selectElement(selector)
  addClass("highlight")
] [
  removeClass("highlight")
]

// ❌ Bad: Regular action requires manual cleanup
action highlight(selector) [
  selectElement(selector)
  addClass("highlight")
  // User must manually remove "highlight" class later
]
```

---

## IDE Features

### Auto-Completion

When typing in a timeline event, the IDE suggests:
- All custom actions defined in the file
- Parameter signatures for selected action

```eligian
timeline "demo" using raf {
  at 0s..5s fa|    // Type "fa" → Suggests "fadeIn(selector, duration)"
}
```

### Go to Definition

Click on an action call and jump to its definition:

```eligian
at 0s..5s fadeIn(".title", 1000)    // Ctrl+Click → Jumps to action fadeIn() definition
```

### Find All References

Right-click an action definition to find all calls:

```eligian
action fadeIn(selector, duration) [    // Find references → Shows all timeline calls
  // ...
]
```

### Rename Refactoring

Rename an action, and all calls are automatically updated:

```eligian
action fadeInElement(selector) [    // Rename to "showElement" → All calls updated
  // ...
]
```

---

## Troubleshooting

### Q: I'm getting "Unknown action" errors for valid actions

**A**: Make sure actions are defined **before** the timeline that uses them (or in the same file).

```eligian
// ✅ Good: Action defined before use
action fadeIn(selector) [ ... ]

timeline "demo" using raf {
  at 0s..5s fadeIn(".box")
}

// ❌ Bad: Action defined after use
timeline "demo" using raf {
  at 0s..5s fadeIn(".box")    // Error: Unknown action
}

action fadeIn(selector) [ ... ]
```

**Fix**: Move action definition above timeline, or use forward declaration (future feature).

### Q: Why can't I call operations directly in timelines?

**A**: Timeline events represent high-level actions that happen at specific times. Operations are low-level DOM/animation primitives that should be composed into actions.

**Rationale**: This separation keeps timelines readable and encourages reusable action definitions.

### Q: The old `{ action() }` syntax still works - when will it be removed?

**A**: The old syntax is deprecated but will work until v1.0.0. You'll see deprecation warnings in v0.7.0+. Migrate at your convenience before v1.0.0.

---

## Next Steps

- **Read the grammar reference**: See `LANGUAGE_SPEC.md` for complete syntax documentation
- **Explore examples**: Check `examples/` directory for real-world usage patterns
- **Report issues**: File bugs at [GitHub Issues](https://github.com/eligius/eligian/issues)

---

**Version**: v0.6.0+
**Last Updated**: 2025-01-23
