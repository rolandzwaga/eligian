# Quickstart Guide: Asset Import Syntax

**Date**: 2025-10-25
**Feature**: Asset Import Syntax (009)
**For**: Eligian DSL Developers

## Overview

The Eligian DSL now supports importing HTML, CSS, and media assets using familiar ES module-like syntax. This guide shows you how to use import statements to organize your timeline assets.

**Important**: This feature provides **syntax validation only**. File loading and content processing are future features. For now, you can declare imports and the compiler will validate the syntax.

---

## Basic Syntax

### Default Imports (Auto-Assignment)

Use keywords to automatically assign assets to configuration properties:

```eligian
layout './layout.html'           // Assigns to layoutTemplate property
styles './main.css'              // Registers CSS for future completions
provider './video.mp4'           // Assigns to timelineProvider.source
```

**Key Points**:
- No identifier needed - assignment is automatic
- Only ONE of each type per file (duplicate error if violated)
- Type inferred from file extension

### Named Imports (Reusable References)

Use `import` keyword to create reusable asset references:

```eligian
import tooltip from './tooltip.html'
import modal from './components/modal.html'
import theme from './theme.css'
import video from './intro.mp4'
```

**Key Points**:
- Identifier required (`tooltip`, `modal`, etc.)
- Can be used multiple times throughout the file
- Type inferred from file extension

---

## Type Inference

The compiler automatically infers asset type from file extension:

```eligian
import layout from './page.html'    // Type: html
import styles from './theme.css'    // Type: css
import video from './intro.mp4'     // Type: media
import audio from './bgm.mp3'       // Type: media
```

**Supported Extensions**:

| Extension | Inferred Type | Description |
|-----------|---------------|-------------|
| `.html` | `html` | HTML files (layouts, content snippets) |
| `.css` | `css` | CSS stylesheets |
| `.mp4`, `.webm` | `media` | Video files |
| `.mp3`, `.wav` | `media` | Audio files |

**Ambiguous Extensions** (require explicit type):
- `.ogg` - Could be audio or video (must use `as media`)

**Unknown Extensions** (require explicit type):
- Any extension not in the table above

---

## Explicit Type Override

For non-standard extensions or to override inference, use `as type`:

```eligian
import data from './template.txt' as html       // Override: treat .txt as HTML
import video from './movie.bin' as media        // Override: treat .bin as media
import sound from './audio.ogg' as media        // Clarify: .ogg is media
```

**When to Use**:
- Unknown file extensions (`.txt`, `.bin`, `.xyz`)
- Ambiguous extensions (`.ogg`)
- Type override for special cases

**Valid Types**:
- `as html` - HTML content
- `as css` - CSS stylesheet
- `as media` - Video or audio file

---

## Path Validation

All import paths **must be relative** to the `.eligian` file:

**✅ Valid Paths**:
```eligian
import layout from './layout.html'                    // Same directory
import modal from '../shared/modal.html'              // Parent directory
import video from './assets/videos/intro.mp4'         // Nested directory
import css from '../../styles/theme.css'              // Multiple levels up
```

**❌ Invalid Paths** (absolute paths rejected):
```eligian
import layout from '/layout.html'                     // Unix absolute path
import modal from 'C:\assets\modal.html'              // Windows absolute path
import video from 'https://example.com/video.mp4'     // URL
```

**Error Message**:
```
Import path must be relative (start with './' or '../'), absolute paths are not portable
Hint: Use './filename.ext' or '../folder/filename.ext' for relative paths
```

---

## Complete Example

```eligian
// Default imports (auto-assignment)
layout './layout.html'
styles './main.css'
provider './video.mp4'

// Named imports (reusable)
import tooltip from './components/tooltip.html'
import modal from './components/modal.html'
import darkTheme from './themes/dark.css'
import intro from './videos/intro.mp4'
import bgm from './audio/background.mp3'

// Explicit type override
import template from './data.txt' as html
import ambiguous from './sound.ogg' as media

// Actions can reference imported assets
action showTooltip [
  selectElement(".info")
  setElementContent(tooltip)         // Use imported HTML
]

action showModal [
  selectElement(".modal-container")
  setElementContent(modal)           // Use imported HTML
]

// Timeline can use imported assets
timeline {
  at 0s..5s showTooltip()
  at 5s..10s showModal()
}
```

---

## Common Validation Errors

### 1. Duplicate Import Name

**Error**:
```
Duplicate import name 'tooltip', import names must be unique
Hint: Choose a different name for this import
```

**Cause**:
```eligian
import tooltip from './tooltip1.html'
import tooltip from './tooltip2.html'  // ❌ Duplicate name
```

**Fix**: Use unique names
```eligian
import tooltip1 from './tooltip1.html'
import tooltip2 from './tooltip2.html'  // ✅ Unique names
```

---

### 2. Reserved Keyword

**Error**:
```
Cannot use reserved keyword 'if' as import name
Hint: Reserved keywords: if, else, for, break, continue, at, action, timeline
```

**Cause**:
```eligian
import if from './template.html'  // ❌ Reserved keyword
```

**Fix**: Choose a non-reserved name
```eligian
import templateIf from './template.html'  // ✅ Valid name
```

---

### 3. Operation Name Conflict

**Error**:
```
Cannot use operation name 'selectElement' as import name
Hint: 'selectElement' is a built-in operation. Choose a different import name
```

**Cause**:
```eligian
import selectElement from './select.html'  // ❌ Conflicts with operation
```

**Fix**: Choose a different name
```eligian
import selectTemplate from './select.html'  // ✅ Valid name
```

---

### 4. Unknown Extension

**Error**:
```
Unknown file extension '.xyz', please specify type: import foo from './file.xyz' as html|css|media
Hint: Add 'as html', 'as css', or 'as media' to specify the asset type
```

**Cause**:
```eligian
import data from './file.xyz'  // ❌ Unknown extension, no type override
```

**Fix**: Add explicit type
```eligian
import data from './file.xyz' as html  // ✅ Explicit type
```

---

### 5. Ambiguous Extension

**Error**:
```
Ambiguous file extension '.ogg', please specify type explicitly
Hint: Add 'as media' to clarify this is a media file
```

**Cause**:
```eligian
import audio from './sound.ogg'  // ❌ .ogg could be audio or video
```

**Fix**: Add explicit type
```eligian
import audio from './sound.ogg' as media  // ✅ Explicit type
```

---

### 6. Absolute Path

**Error**:
```
Import path must be relative (start with './' or '../'), absolute paths are not portable
Hint: Use './filename.ext' or '../folder/filename.ext' for relative paths
```

**Cause**:
```eligian
import layout from '/layout.html'              // ❌ Absolute path
import modal from 'C:\assets\modal.html'       // ❌ Windows absolute
import video from 'https://example.com/v.mp4'  // ❌ URL
```

**Fix**: Use relative paths
```eligian
import layout from './layout.html'             // ✅ Relative
import modal from '../assets/modal.html'       // ✅ Relative
import video from './videos/v.mp4'             // ✅ Relative
```

---

### 7. Duplicate Default Import

**Error**:
```
Duplicate 'layout' import, only one layout import is allowed
Hint: Remove duplicate layout import statements
```

**Cause**:
```eligian
layout './layout1.html'
layout './layout2.html'  // ❌ Duplicate layout import
```

**Fix**: Keep only one
```eligian
layout './layout1.html'  // ✅ Single layout import
```

---

## Integration with Existing Features

### Using Imported HTML in Actions

```eligian
import tooltip from './tooltip.html'

action showTooltip [
  selectElement(".info-icon")
  setElementContent(tooltip)    // Pass imported HTML to operation
]
```

### Using Imported CSS (Future Feature)

```eligian
styles './theme.css'

action applyTheme [
  selectElement(".container")
  addClass("dark-theme")        // Future: IDE will complete from imported CSS
]
```

### Using Imported Media as Provider

```eligian
provider './video.mp4'

timeline {
  at 0s..5s fadeIn()
  at 5s..10s fadeOut()
  // Timeline syncs with imported video provider
}
```

---

## Backward Compatibility

Import statements are **optional**. Existing Eligian files without imports continue to work:

**Old File (No Imports)** - Still Valid:
```eligian
action fadeIn [
  selectElement(".box")
  animate({opacity: 1}, 1000)
]

timeline {
  at 0s..5s fadeIn()
}
```

**New File (With Imports)** - Valid:
```eligian
layout './layout.html'
import tooltip from './tooltip.html'

action fadeIn [
  selectElement(".box")
  animate({opacity: 1}, 1000)
]

timeline {
  at 0s..5s fadeIn()
}
```

---

## Best Practices

1. **Place imports at the top** of your `.eligian` file
2. **Use default imports** for main assets (layout, styles, provider)
3. **Use named imports** for reusable components (tooltips, modals)
4. **Group imports by type** (HTML, CSS, media)
5. **Use descriptive names** for imported assets
6. **Prefer relative paths** starting with `./` for same-directory files
7. **Add explicit types** for non-standard extensions

**Example**:
```eligian
// Default imports
layout './layout.html'
styles './main.css'
provider './video.mp4'

// HTML imports
import tooltip from './components/tooltip.html'
import modal from './components/modal.html'

// CSS imports
import darkTheme from './themes/dark.css'
import lightTheme from './themes/light.css'

// Media imports
import intro from './videos/intro.mp4'
import bgm from './audio/background.mp3'

// Actions and timeline...
```

---

## Next Steps

After this syntax feature, future features will add:

1. **File Loading**: Compile-time file existence validation
2. **Content Processing**: HTML/CSS parsing for validation
3. **CSS Completions**: Extract classes/IDs for IDE autocomplete
4. **Live Preview**: Apply imported CSS to VS Code preview WebView

For now, focus on:
- ✅ Writing correct import syntax
- ✅ Using relative paths
- ✅ Choosing unique, descriptive import names
- ✅ Adding explicit types when needed

---

## Summary

**Default Imports** (auto-assignment):
```eligian
layout './layout.html'
styles './main.css'
provider './video.mp4'
```

**Named Imports** (reusable):
```eligian
import tooltip from './tooltip.html'
import theme from './theme.css'
import video from './intro.mp4'
```

**Explicit Type Override**:
```eligian
import data from './template.txt' as html
```

**Key Rules**:
- Paths must be relative (`./` or `../`)
- Import names must be unique
- Import names cannot be reserved keywords or operation names
- Unknown/ambiguous extensions require explicit type (`as type`)
- Only one default import per type (layout, styles, provider)

Happy importing! 🚀
