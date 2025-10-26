# Quickstart: CSS IDE Features

**Date**: 2025-10-26
**Audience**: Eligian DSL developers using VS Code
**Prerequisites**: Feature 013 (CSS Validation Infrastructure) installed and working

## Overview

This guide shows you how to use CSS autocomplete, hover, and quick fixes to write Eligian code faster and more accurately.

---

## Feature 1: CSS Class Autocomplete

### Trigger Autocomplete in className Parameters

When typing operations that accept CSS class names, autocomplete suggests available classes:

```eligian
styles "./styles.css"  // Import CSS file with .button, .primary, .danger classes

action fadeIn [
  addClass("")  // Type here and press Ctrl+Space (Cmd+Space on Mac)
  //        ↑
  //    Cursor position - autocomplete triggers
]
```

**What You'll See**:
- Dropdown with all CSS classes from imported files
- Classes ranked first (before operations/variables)
- Detail showing "CSS class"
- Icon indicating property type (box icon)

**Supported Operations**:
- `addClass("...")`
- `removeClass("...")`
- `toggleClass("...")`

### Trigger Autocomplete in Selectors

When typing selectors in `selectElement()`, autocomplete triggers after `.` or `#`:

```eligian
action highlight [
  selectElement(".")  // After typing dot, press Ctrl+Space
  //              ↑
  //          Classes appear
]

action scrollTo [
  selectElement("#")  // After typing hash, press Ctrl+Space
  //              ↑
  //           IDs appear
]
```

**Completion Behavior**:
- After `.`: Shows CSS classes (without dot prefix)
- After `#`: Shows CSS IDs (without hash prefix)
- Filters as you type: `.bu` shows only classes starting with "bu"
- Press Enter/Tab to insert selected class

### Performance

- **Latency**: <100ms from trigger to suggestions shown
- **Large Files**: Handles 1000+ CSS classes without slowdown
- **Auto-Refresh**: Suggestions update within 500ms when CSS files change

---

## Feature 2: CSS Hover Tooltips

### Hover Over Class Names

Hover your mouse over CSS class names to see where they're defined and preview their rules:

```eligian
action applyStyle [
  addClass("button")  // Hover over "button" to see definition
  //        ↑
  //    Hover here
]
```

**Tooltip Shows**:
```markdown
**CSS Class**: `button`

Defined in: styles.css:15

​```css
.button {
  background: blue;
  color: white;
  padding: 10px;
}
​```
```

### Hover in Selectors

Hover works in selector strings too. For compound selectors, hover shows the specific class under cursor:

```eligian
action complexSelect [
  selectElement(".button.primary")  // Hover over "button" or "primary"
  //              ↑       ↑
  //          Either position works
]
```

**Behavior**:
- Hover on `button`: Shows `.button` rule
- Hover on `primary`: Shows `.primary` rule
- Hover on whitespace: No tooltip

### Hover for IDs

```eligian
action selectHeader [
  selectElement("#header")  // Hover over "header"
  //              ↑
]
```

**Tooltip Shows**:
```markdown
**CSS ID**: `header`

Defined in: layout.css:3

​```css
#header {
  position: fixed;
  top: 0;
}
​```
```

### Hover Performance

- **Latency**: <50ms from hover to tooltip display
- **Multiple Definitions**: If class is defined in multiple files, shows all locations

---

## Feature 3: Quick Fix for Missing CSS Classes

### Trigger Quick Fix

When validation reports an unknown CSS class, a lightbulb icon appears:

```eligian
styles "./styles.css"

action test [
  addClass("new-class")  // Error: Unknown CSS class 'new-class'
  //        ↑
  //    Lightbulb appears on this line
]
```

**Steps to Apply Quick Fix**:

1. **Click lightbulb** or press `Ctrl+.` (Cmd+. on Mac)
2. **Select**: "Create '.new-class' in styles.css"
3. **CSS file updated**:
   ```css
   /* ... existing CSS ... */

   .new-class {
     /* TODO: Add styles */
   }
   ```

4. **Validation error disappears** (hot-reload detects CSS change)

### Quick Fix Behavior

**Target File Selection**:
- Creates class in **first imported CSS file**
- If multiple files imported:
  ```eligian
  styles "./base.css"
  styles "./theme.css"
  ```
  Quick fix creates class in `base.css`

**Insertion Location**:
- Always appends at **end of CSS file**
- Safest location - won't break existing rules
- You can manually move the rule afterwards

**CSS Template**:
```css

.<className> {
  /* TODO: Add styles */
}
```

**No Quick Fix Available**:
- When **no CSS files imported** - fix unavailable (can't determine target file)
- For CSS IDs - currently not supported (classes only)

**Post-Fix Behavior**:
- After applying quick fix, the CSS file automatically opens
- Validation error disappears immediately via hot-reload (no need to manually save)

### Quick Fix Performance

- **Execution Time**: <1s from click to CSS file updated
- **IDE Refresh**: Validation clears immediately via hot-reload

---

## Troubleshooting

### Autocomplete Not Showing CSS Classes

**Symptom**: Autocomplete shows operations but not CSS classes

**Causes**:

1. **CSS file not imported**
   ```eligian
   // Missing: styles "./styles.css"
   action test [
     addClass("")  // No CSS classes available
   ]
   ```
   **Fix**: Add `styles` import at top of file

2. **CSS file has errors**
   - Check VS Code Problems panel for CSS parse errors
   - Fix CSS syntax errors
   - Reload VS Code window if needed

3. **Wrong operation**
   - Autocomplete only triggers in supported operations
   - Supported: `addClass`, `removeClass`, `toggleClass`, `selectElement`

4. **Cursor position**
   - For selectors, cursor must be after `.` or `#`
   - For className operations, cursor must be inside string quotes

### Hover Not Working

**Symptom**: No tooltip appears when hovering over class name

**Causes**:

1. **Class doesn't exist in CSS**
   - Hover only works for defined classes
   - Check if class exists in imported CSS files

2. **Hovering in wrong location**
   - Must hover directly over class name text
   - Not the quotes, not whitespace

3. **Multiple CSS files with same class**
   - Hover shows all definitions
   - If tooltip is too large, scroll to see all

### Quick Fix Not Available

**Symptom**: Lightbulb doesn't appear for unknown class error

**Causes**:

1. **No CSS files imported**
   - Quick fix requires at least one `styles` import
   - Add CSS import to enable quick fix

2. **Error is not CSS-related**
   - Quick fix only works for CSS validation errors
   - Check error message - must be "Unknown CSS class"

3. **CSS for IDs**
   - Quick fix currently only supports classes
   - IDs must be added manually

---

## Performance Characteristics

| Feature | Target Latency | Tested Up To |
|---------|----------------|--------------|
| Autocomplete | <100ms | 1000+ classes |
| Hover | <50ms | 100 CSS files |
| Quick Fix | <1s | N/A |

**Hot-Reload**:
- CSS file changes detected within 300ms (debounced)
- Autocomplete/hover update within 500ms of CSS save
- No IDE restart needed for CSS changes

---

## Keyboard Shortcuts

| Action | Windows/Linux | Mac |
|--------|---------------|-----|
| Trigger Autocomplete | `Ctrl+Space` | `Cmd+Space` |
| Quick Fix Menu | `Ctrl+.` | `Cmd+.` |
| Accept Completion | `Enter` or `Tab` | `Enter` or `Tab` |

**Pro Tips**:
- Type first few letters before triggering autocomplete for filtered results
- Use arrow keys to navigate completion list
- Press `Esc` to dismiss autocomplete/hover

---

## Examples

### Example 1: Building a Button Component

```eligian
styles "./ui.css"  // Contains: .btn, .btn-primary, .btn-large

action createButton [
  selectElement("#root")
  createElement("button", {id: "myButton", text: "Click Me"})
  selectElement("#myButton")
  addClass("btn")      // Autocomplete: .btn, .btn-primary, .btn-large
  addClass("btn-pr")   // Type "pr" to filter → .btn-primary selected
]
```

### Example 2: Hover for Documentation

```eligian
action applyTheme [
  addClass("dark-theme")  // Hover shows:
  //        ↑             // **CSS Class**: `dark-theme`
  //                      // Defined in: themes.css:45
  //                      // ```css
  //                      // .dark-theme {
  //                      //   background: #1a1a1a;
  //                      //   color: #ffffff;
  //                      // }
  //                      // ```
]
```

### Example 3: Quick Fix Workflow

```eligian
styles "./styles.css"

action prototype [
  addClass("experimental")  // 🔴 Error: Unknown CSS class 'experimental'
  //        ↑
  //    1. Lightbulb appears
  //    2. Ctrl+. → "Create '.experimental' in styles.css"
  //    3. CSS file updated with TODO comment
  //    4. Error clears automatically
]
```

---

## FAQ

**Q: Can I disable CSS autocomplete?**
A: Currently no setting to disable. CSS classes are part of the language.

**Q: Why does autocomplete show old classes after I deleted them from CSS?**
A: Save the CSS file - hot-reload should update within 500ms. If not, reload VS Code window.

**Q: Can quick fix create classes in a specific CSS file?**
A: Not yet - it always uses the first imported file. Move the rule manually afterwards.

**Q: Does hover work for CSS variables (`--my-var`)?**
A: Not yet - Feature 014 focuses on classes and IDs. CSS variables may come later.

**Q: Can I rename CSS classes across all usage?**
A: Not yet - rename refactoring is out of scope for Feature 014. Use find-and-replace for now.

---

## Next Steps

- **Explore**: Try autocomplete in your existing Eligian projects
- **Report Issues**: File bugs at [github.com/your-project/issues]
- **Request Features**: Suggest improvements in discussions

**Related Features**:
- Feature 013: CSS Validation (reports unknown classes that trigger quick fixes)
- Feature 011: CSS Preview (shows live CSS in preview panel)
