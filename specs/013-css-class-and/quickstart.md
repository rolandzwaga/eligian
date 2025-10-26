# Quickstart Guide: CSS Class and Selector Validation

**Created**: 2025-10-26
**Feature**: Spec 1 - Validation Infrastructure
**Audience**: Eligian DSL developers

---

## Overview

This guide shows how to use CSS class and selector validation in your Eligian presentations. The validation system catches typos and missing CSS classes at compile time, before you run your timeline.

---

## Quick Start

### 1. Import CSS Files

Add `styles` declarations at the top of your `.eligian` file:

```eligian
// Import single CSS file
styles "./styles/main.css"

// Import multiple CSS files (loaded in order)
styles "./styles/base.css"
styles "./styles/theme.css"
styles "./styles/animations.css"
```

**Path Resolution**: Paths are relative to your `.eligian` file.

### 2. Use CSS Classes in Operations

Reference CSS classes in `addClass()` and `selectElement()` operations:

```eligian
styles "./styles.css"

timeline "My Presentation" at 0s {
  at 0s..5s selectElement("#intro") {
    addClass("fade-in")       // ✅ Valid (if .fade-in exists in styles.css)
    animate({opacity: 1}, 1000)
  }
}
```

### 3. Get Real-Time Validation

As you type, the VS Code extension validates class names and shows errors:

```eligian
addClass("primry")  // ❌ Error: Unknown CSS class: 'primry'. Did you mean: primary?
```

Errors appear in:
- **Inline red squigglies** in the editor
- **Problems panel** (Ctrl+Shift+M / Cmd+Shift+M)

---

## Basic Usage

### className Parameters

Operations with `ParameterType.className` parameters are validated:

```eligian
styles "./styles.css"  // .button, .primary, .disabled

timeline "Example" at 0s {
  at 0s..2s selectElement("#box") {
    addClass("button")      // ✅ Valid
    addClass("primary")     // ✅ Valid
    addClass("primry")      // ❌ Error: Unknown CSS class: 'primry'. Did you mean: primary?
    addClass("xyz")         // ❌ Error: Unknown CSS class: 'xyz'
  }
}
```

### selector Parameters

Operations with `ParameterType.selector` parameters validate all classes and IDs in the selector:

```eligian
styles "./styles.css"  // .button, .primary, #header

timeline "Example" at 0s {
  at 0s..2s {
    selectElement("#header")              // ✅ Valid (ID exists)
    selectElement(".button")              // ✅ Valid (class exists)
    selectElement(".button.primary")      // ✅ Valid (both classes exist)
    selectElement(".button.primry")       // ❌ Error: Unknown CSS class in selector: 'primry'
    selectElement("#header.active")       // ❌ Error: Unknown CSS class in selector: 'active'
  }
}
```

**Supported Selector Features**:
- Multiple classes: `.button.primary.large`
- IDs with classes: `#header.active`
- Combinators: `.parent > .child` (both classes validated)
- Pseudo-classes: `.button:hover` (pseudo-class ignored, `.button` validated)
- Attribute selectors: `.button[disabled]` (attribute ignored, `.button` validated)

**Not Validated** (assumed valid):
- Pseudo-classes: `:hover`, `:nth-child(2)`, `:focus`
- Pseudo-elements: `::before`, `::after`
- Attribute selectors: `[disabled]`, `[data-foo="bar"]`
- Element types: `div`, `span`, `a`

---

## Advanced Usage

### Multiple CSS Files

Import multiple CSS files to build up your available classes:

```eligian
styles "./styles/reset.css"      // Basic reset styles
styles "./styles/base.css"       // .button, .card, .container
styles "./styles/theme.css"      // .primary, .secondary, .dark-mode
styles "./styles/animations.css" // .fade-in, .slide-up

timeline "Example" at 0s {
  at 0s..2s selectElement("#box") {
    addClass("button")     // ✅ From base.css
    addClass("primary")    // ✅ From theme.css
    addClass("fade-in")    // ✅ From animations.css
  }
}
```

**Note**: Classes from all imported files are available (CSS cascade rules apply at runtime).

### Hot-Reload on CSS Changes

When you save changes to a CSS file, validation updates automatically:

**Before** (styles.css):
```css
.button { color: blue; }
```

**Eligian file**:
```eligian
addClass("new-class")  // ❌ Error: Unknown CSS class: 'new-class'
```

**After** (you add to styles.css):
```css
.button { color: blue; }
.new-class { color: red; }  /* Added */
```

**Eligian file** (error disappears within 300ms):
```eligian
addClass("new-class")  // ✅ Valid (no error)
```

**No restart needed**: The VS Code extension automatically detects CSS file changes and updates validation.

### Complex Selectors

Validate complex selectors with multiple classes:

```eligian
styles "./styles.css"  // .parent, .child, .active

timeline "Example" at 0s {
  at 0s..2s {
    // Combinators (both classes validated)
    selectElement(".parent > .child")        // ✅ Valid
    selectElement(".parent + .sibling")      // ❌ Error: Unknown CSS class in selector: 'sibling'

    // Multiple classes (all validated)
    selectElement(".button.primary.active")  // ✅ Valid (if all exist)
    selectElement(".button.primry.active")   // ❌ Error: Unknown CSS class in selector: 'primry'

    // Pseudo-classes (ignored)
    selectElement(".button:hover")           // ✅ Valid (.button validated, :hover ignored)
    selectElement(".button:nth-child(2)")    // ✅ Valid

    // Attribute selectors (ignored)
    selectElement(".button[disabled]")       // ✅ Valid (.button validated, [disabled] ignored)
  }
}
```

---

## Error Reference

### Error: Unknown CSS Class

**Code**: `unknown-css-class`

**Cause**: Referenced a CSS class that doesn't exist in any imported CSS file.

**Example**:
```eligian
addClass("primry")  // Typo: should be "primary"
```

**Error Message**:
```
Unknown CSS class: 'primry'. Did you mean: primary?
```

**Fix**:
1. Check spelling of class name
2. Ensure CSS file containing the class is imported
3. Ensure CSS file has been saved
4. If suggestions appear, use the suggested class name

---

### Error: Unknown CSS ID

**Code**: `unknown-css-id`

**Cause**: Referenced a CSS ID that doesn't exist in any imported CSS file.

**Example**:
```eligian
selectElement("#headr")  // Typo: should be "#header"
```

**Error Message**:
```
Unknown CSS ID in selector: 'headr'
```

**Fix**:
1. Check spelling of ID name
2. Ensure CSS file containing the ID is imported
3. Ensure CSS file has been saved

---

### Error: Invalid CSS Selector Syntax

**Code**: `invalid-selector-syntax`

**Cause**: Selector has invalid CSS syntax (unclosed brackets, unexpected characters, etc.).

**Example**:
```eligian
selectElement(".button[")  // Unclosed attribute selector
```

**Error Message**:
```
Invalid CSS selector syntax: Unexpected '[' found
```

**Fix**:
1. Check selector syntax
2. Ensure all brackets are closed: `[]`, `()`
3. Ensure combinators are valid: `>`, `+`, `~`, ` ` (space)
4. Test selector in browser DevTools to verify syntax

---

### Error: CSS File Has Syntax Errors

**Code**: `invalid-css-file`

**Cause**: Imported CSS file has syntax errors (unclosed braces, invalid properties, etc.).

**Example**:
```css
/* styles.css - INVALID */
.button {
  color: blue
  /* Missing semicolon or closing brace */
```

**Error Message** (in Eligian file at CSS import statement):
```
CSS file 'styles.css' has syntax errors (line 3, column 14): Missed semicolon
```

**Fix**:
1. Open the CSS file (click "Open File" in error notification)
2. Fix syntax error at indicated line/column
3. Save CSS file
4. Validation will update automatically within 300ms

---

## Common Patterns

### Pattern 1: Importing Shared Styles

**Use Case**: Multiple presentations share common CSS.

**Setup**:
```
project/
  styles/
    shared.css       # Shared across all presentations
    presentation-a.css
    presentation-b.css
  presentations/
    presentation-a.eligian
    presentation-b.eligian
```

**presentation-a.eligian**:
```eligian
styles "../styles/shared.css"
styles "../styles/presentation-a.css"

timeline "Presentation A" at 0s {
  at 0s..5s selectElement("#intro") {
    addClass("shared-class")   // ✅ From shared.css
    addClass("custom-class")   // ✅ From presentation-a.css
  }
}
```

---

### Pattern 2: CSS Framework Integration

**Use Case**: Using external CSS frameworks (Bootstrap, Tailwind, etc.).

**Setup**:
```eligian
styles "./node_modules/bootstrap/dist/css/bootstrap.min.css"
styles "./custom-overrides.css"

timeline "Example" at 0s {
  at 0s..2s selectElement("#box") {
    addClass("btn")             // ✅ From Bootstrap
    addClass("btn-primary")     // ✅ From Bootstrap
    addClass("custom-override") // ✅ From custom-overrides.css
  }
}
```

**Note**: Validation works with any CSS file, including minified frameworks.

---

### Pattern 3: Conditional Classes

**Use Case**: Adding/removing classes based on timeline state.

**Setup**:
```eligian
styles "./styles.css"  // .active, .inactive, .hidden

action showElement [
  removeClass("hidden")
  addClass("active")
]

action hideElement [
  removeClass("active")
  addClass("hidden")
]

timeline "Example" at 0s {
  at 0s..2s selectElement("#box") {
    showElement()    // ✅ Both classes validated
  }

  at 2s..4s selectElement("#box") {
    hideElement()    // ✅ Both classes validated
  }
}
```

**Benefit**: Catch typos in conditional class logic before runtime.

---

## Troubleshooting

### Q: Validation shows errors for valid classes

**A**: Ensure the CSS file is imported:

```eligian
// Missing import!
timeline "Example" at 0s {
  at 0s..2s selectElement("#box") {
    addClass("button")  // ❌ Error (no CSS imported)
  }
}
```

**Fix**:
```eligian
styles "./styles.css"  // Add this!

timeline "Example" at 0s {
  at 0s..2s selectElement("#box") {
    addClass("button")  // ✅ Valid now
  }
}
```

---

### Q: Validation doesn't update after saving CSS

**A**: Check that:
1. CSS file is saved (Ctrl+S / Cmd+S)
2. CSS file path is correct (relative to `.eligian` file)
3. No syntax errors in CSS file (check Problems panel)

If still not working, try:
- Reload VS Code window (Ctrl+Shift+P > "Reload Window")
- Check VS Code Output panel > "Eligian Language Server" for errors

---

### Q: Validation is slow

**A**: Check CSS file size:
- **< 1000 lines**: Should validate in < 50ms (instant)
- **> 5000 lines**: May take 100-200ms (still acceptable)
- **> 10000 lines**: Consider splitting CSS into multiple files

**Success Criteria**: Validation completes within 50ms for typical files (< 1000 lines).

---

### Q: "Did you mean?" suggestions are wrong

**A**: Suggestions use Levenshtein distance (edit distance ≤ 2). Sometimes this produces false suggestions:

```eligian
addClass("xyz")  // No suggestions (no classes within edit distance 2)
addClass("buton")  // Suggests "button" (edit distance 1)
```

If suggestions are unhelpful, ignore them and check your CSS file directly.

---

## Performance Tips

### 1. Import Only What You Need

**Bad** (imports entire framework):
```eligian
styles "./node_modules/bootstrap/dist/css/bootstrap.min.css"  // 10000+ lines
```

**Good** (imports only needed components):
```eligian
styles "./styles/bootstrap-buttons.css"   // Extracted button classes only
styles "./styles/bootstrap-grid.css"      // Extracted grid classes only
```

**Benefit**: Faster parsing (< 100ms) and smaller class lists for validation.

---

### 2. Use Multiple Small CSS Files

**Bad** (one huge file):
```eligian
styles "./styles/everything.css"  // 5000 lines
```

**Good** (split by concern):
```eligian
styles "./styles/reset.css"
styles "./styles/typography.css"
styles "./styles/layout.css"
styles "./styles/components.css"
```

**Benefit**: Easier to maintain, faster hot-reload (only changed file is re-parsed).

---

### 3. Avoid CSS Nesting Depth

**Note**: This validation system does NOT follow nested CSS `@import` statements.

**Example**:
```css
/* base.css */
@import "reset.css";  /* This import is NOT followed */
.button { color: blue; }
```

**Workaround**: Import all CSS files directly in your `.eligian` file:
```eligian
styles "./styles/reset.css"   // Import directly
styles "./styles/base.css"    // Import directly
```

---

## Best Practices

### 1. Import CSS at Top of File

**Good**:
```eligian
styles "./styles.css"

action fadeIn [...]
timeline "Example" at 0s {...}
```

**Avoid**:
```eligian
action fadeIn [...]

styles "./styles.css"  // Works, but less readable

timeline "Example" at 0s {...}
```

**Benefit**: Easier to see which CSS files are imported.

---

### 2. Use Descriptive Class Names

**Good**:
```css
.button-primary { background: blue; }
.fade-in-animation { animation: fadeIn 1s; }
```

**Avoid**:
```css
.bp { background: blue; }  /* Hard to remember, easy to typo */
.f { animation: fadeIn 1s; }
```

**Benefit**: Validation suggestions are more helpful (Levenshtein distance works better with longer names).

---

### 3. Group Related Classes

**Good** (consistent naming):
```css
.button { ... }
.button-primary { ... }
.button-secondary { ... }
.button-disabled { ... }
```

**Usage**:
```eligian
addClass("button")
addClass("button-primary")  // ✅ Easy to remember pattern
```

**Benefit**: Validation errors are easier to fix (pattern is consistent).

---

## Next Steps

### Spec 1: Validation Infrastructure (Current)

✅ Real-time CSS class validation
✅ Hot-reload on CSS file changes
✅ "Did you mean?" suggestions
✅ Error reporting with diagnostics

### Spec 2: IDE Features (Future)

🔜 **Autocomplete**: Suggest CSS classes while typing
🔜 **Hover Preview**: Show CSS rule definition on hover
🔜 **Go to Definition**: Jump to CSS file when clicking class name
🔜 **Code Actions**: Quick fixes to create missing CSS classes
🔜 **Find References**: Find all usages of a CSS class
🔜 **Rename Refactoring**: Rename CSS class across Eligian and CSS files

**Status**: Spec 2 will be created after Spec 1 is complete.

---

## FAQ

**Q: Does validation work with Sass/SCSS/Less?**
A: No, only plain CSS is supported. Compile Sass/SCSS/Less to CSS first, then import the compiled `.css` file.

**Q: Can I disable validation for specific lines?**
A: Not in Spec 1. Validation is always on. If you need to use dynamic class names, use variable references (they're not validated).

**Q: How do I validate dynamic class names?**
A: You can't. Validation only works for string literals:
```eligian
let className = "button"
addClass(className)  // ✅ No validation (variable reference)
addClass("button")   // ✅ Validated (string literal)
```

**Q: Does validation work offline?**
A: Yes, validation is local (uses PostCSS parser in the language server). No internet required.

**Q: How do I report validation bugs?**
A: File an issue at https://github.com/rolandzwaga/eligius/issues with:
1. CSS file content
2. Eligian file content
3. Expected behavior
4. Actual behavior (error message)

---

**Quickstart Guide Status**: ✅ Complete
**Ready for Implementation**: Yes
