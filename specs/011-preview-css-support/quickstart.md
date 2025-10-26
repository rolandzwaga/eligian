# Quickstart Guide: CSS Live Reload in Eligian Preview

**Feature**: 011-preview-css-support
**Date**: 2025-10-25

## Overview

This guide explains how to use CSS live reload in the Eligian VS Code extension preview. CSS files imported in your Eligian file are automatically loaded into the preview and hot-reloaded when you make changes, without restarting the timeline.

---

## Basic Usage

### Step 1: Import CSS in Your Eligian File

```eligian
// my-presentation.eligian
styles "./styles/main.css"
styles "./styles/theme.css"

layout "./layout.html"

timeline video "presentation.mp4" [
  at 0s..5s selectElement("#title") for 1s
]
```

**Note**: CSS file paths are relative to your `.eligian` file location.

---

### Step 2: Open the Preview

1. Open your `.eligian` file in VS Code
2. Run command: **Eligian: Open Preview** (or right-click → Preview)
3. Preview webview opens with your CSS loaded automatically

**Expected Behavior**:
- CSS files load within 500ms
- Styles apply to timeline elements
- Timeline plays normally

---

### Step 3: Edit CSS and See Changes Instantly

1. Open `./styles/main.css` in VS Code
2. Make changes (e.g., change `color: red` to `color: blue`)
3. Save the file (Ctrl+S / Cmd+S)

**Expected Behavior**:
- CSS hot-reloads within 300ms
- Styles update in preview immediately
- **Timeline continues playing** (no restart!)
- **Element states preserved** (no flicker)

---

## How It Works

### Behind the Scenes

1. **Compilation**: Eligian compiler extracts CSS file paths from `styles` imports
2. **Loading**: Extension loads CSS files and converts paths for webview security
3. **Injection**: CSS injected as inline `<style>` tags in preview
4. **Watching**: File system watcher monitors CSS files for changes
5. **Hot-Reload**: On change, CSS content updated without page reload

**Key Benefit**: Eligius timeline engine keeps running during CSS updates. You can style animations while they play!

---

## Features

### Multiple CSS Files

Import multiple CSS files - they load in order (CSS cascade):

```eligian
styles "./reset.css"       // Loads first (base styles)
styles "./components.css"  // Loads second
styles "./theme.css"       // Loads last (overrides)
```

**CSS Cascade**: Later files override earlier files (standard CSS behavior).

---

### Relative Paths in CSS

CSS files can reference images, fonts, and other assets with relative paths:

```css
/* styles/main.css */
.logo {
  background-image: url('./images/logo.png');  /* Relative to CSS file */
}

@font-face {
  font-family: 'MyFont';
  src: url('../fonts/myfont.woff2');  /* Relative to CSS file */
}
```

**Automatic Path Conversion**: Extension converts relative paths to webview URIs automatically.

---

### Error Handling

If a CSS file has issues, the preview continues working:

**File Not Found**:
```
❌ CSS file not found: ./styles/main.css
```
- Preview shows error notification
- Previous CSS retained (if existed)
- Fix path and save - auto-reloads

**Read Error** (file locked, permission denied):
```
❌ Failed to load CSS: ./styles/main.css (Permission denied)
```
- Error notification shown
- Previous CSS retained
- Fix issue and save - auto-reloads

**Syntax Error**:
- CSS with syntax errors loads (browser ignores invalid rules)
- Valid rules still apply
- No timeline disruption

---

## Troubleshooting

### CSS Not Loading

**Problem**: CSS doesn't appear in preview.

**Checklist**:
- [ ] CSS file path is correct (relative to `.eligian` file)
- [ ] CSS file exists on disk
- [ ] File has `.css` extension
- [ ] No permission issues (file readable)
- [ ] Preview is open (close and reopen if needed)

**Debug**: Check VS Code Developer Tools (Help → Toggle Developer Tools) for errors.

---

### CSS Not Hot-Reloading

**Problem**: CSS changes don't reflect after saving.

**Checklist**:
- [ ] File was actually saved (check file indicator)
- [ ] Preview is still open
- [ ] CSS file is imported in current `.eligian` file
- [ ] No file system errors (check notifications)
- [ ] Wait 300ms (debounce delay)

**Workaround**: Close and reopen preview if hot-reload stops working.

---

### Relative Paths Not Working

**Problem**: Images/fonts in CSS don't load.

**Checklist**:
- [ ] Paths are relative to CSS file (not Eligian file)
- [ ] Assets exist on disk
- [ ] No path traversal (`../` out of workspace)
- [ ] No absolute paths (`/`, `C:\`)

**Example**:
```
Project structure:
  my-presentation.eligian
  styles/
    main.css
    images/
      logo.png

CSS: url('./images/logo.png')  ✅ Works
CSS: url('../images/logo.png') ❌ Wrong (not relative to CSS file)
```

---

### Timeline Restarting on CSS Change

**Problem**: Timeline restarts when CSS changes.

**This should NOT happen!** Hot-reload preserves timeline state.

**If this happens**:
1. Report as bug (this violates FR-005)
2. Include: Eligian file, CSS file, steps to reproduce
3. Workaround: Make CSS changes before starting timeline

---

## Best Practices

### 1. Organize CSS Files

```
project/
  my-presentation.eligian
  styles/
    reset.css        # Base styles
    components.css   # Reusable components
    theme.css        # Presentation-specific styles
  images/
    logo.png
```

**Benefit**: Clear structure, easy to find styles.

---

### 2. Use CSS Cascade

Order imports from general to specific:

```eligian
styles "./styles/reset.css"       # Browser reset
styles "./styles/components.css"  # Component library
styles "./styles/my-theme.css"    # Presentation styles
```

**Why**: Later files override earlier files (CSS cascade).

---

### 3. Keep CSS Modular

Split styles into logical files:

```css
/* components.css - Reusable components */
.button { ... }
.card { ... }

/* theme.css - Presentation-specific */
.title { color: blue; }
.subtitle { color: gray; }
```

**Benefit**: Easier to maintain, reuse across presentations.

---

### 4. Test CSS Changes Live

1. Start timeline playing
2. Edit CSS and save
3. See changes instantly while animation plays

**Use Case**: Perfect for styling animations - adjust styles while timeline plays!

---

## Advanced Usage

### Conditional CSS (Future)

Currently, all imported CSS loads. Future enhancement could support conditions:

```eligian
// Not yet supported - all CSS loads unconditionally
styles "./dark-theme.css" if theme == "dark"
```

**Workaround**: Use CSS custom properties (CSS variables) for theming.

---

### CSS Preprocessing (Not Supported)

The extension loads `.css` files directly. Preprocessing (SASS, LESS) not supported.

**Workaround**: Use a preprocessor watch script to compile to CSS:
```bash
sass --watch styles/main.scss:styles/main.css
```

Then import the compiled `.css` file:
```eligian
styles "./styles/main.css"  // Compiled from main.scss
```

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Preview | `Ctrl+K P` (Windows/Linux) or `Cmd+K P` (Mac) |
| Save CSS | `Ctrl+S` (Windows/Linux) or `Cmd+S` (Mac) |
| Close Preview | `Ctrl+W` (Windows/Linux) or `Cmd+W` (Mac) |
| Reopen Preview | `Ctrl+Shift+P` → "Eligian: Open Preview" |

---

## Examples

### Example 1: Basic Styling

**File**: `presentation.eligian`
```eligian
styles "./styles.css"
layout "./layout.html"

timeline video "video.mp4" [
  at 0s..3s selectElement("#title") for 1s
]
```

**File**: `styles.css`
```css
#title {
  font-size: 48px;
  color: white;
  text-shadow: 2px 2px 4px black;
}
```

**Result**: Title element styled with large white text and shadow.

---

### Example 2: Multiple CSS Files

**File**: `presentation.eligian`
```eligian
styles "./reset.css"
styles "./components.css"
styles "./theme.css"

layout "./layout.html"

timeline video "video.mp4" [
  at 0s..3s selectElement(".button") for 1s
]
```

**File**: `components.css`
```css
.button {
  padding: 10px 20px;
  border: 2px solid black;
  border-radius: 5px;
}
```

**File**: `theme.css`
```css
.button {
  background: blue;  /* Overrides components.css */
  color: white;
}
```

**Result**: Button styled with padding, border, rounded corners, blue background, and white text.

---

### Example 3: Styling Animations

**File**: `presentation.eligian`
```eligian
styles "./animations.css"
layout "./layout.html"

timeline video "video.mp4" [
  at 0s..3s selectElement("#box") for 1s
  at 0s..3s addCSS("animated") for 1s
]
```

**File**: `animations.css`
```css
#box {
  width: 100px;
  height: 100px;
  background: red;
}

#box.animated {
  transition: transform 1s;
  transform: translateX(200px);
}
```

**Workflow**:
1. Start timeline playing
2. Edit `animations.css` (change `200px` to `400px`)
3. Save - animation updates instantly while playing!

**Result**: Real-time animation adjustments without restarting timeline.

---

## FAQ

**Q: Do I need to restart the preview after changing CSS imports?**
A: No! Adding/removing CSS imports triggers automatic reload. Just save your `.eligian` file.

**Q: Can I use CSS from CDN (external URLs)?**
A: Not directly. Download the CSS file locally and import it via `styles "./local-copy.css"`.

**Q: What happens if I delete a CSS file while preview is open?**
A: You'll see an error notification. The preview continues with remaining CSS. Restore the file to fix.

**Q: Can I use CSS variables (custom properties)?**
A: Yes! CSS custom properties work normally:
```css
:root {
  --primary-color: blue;
}
.title { color: var(--primary-color); }
```

**Q: Does hot-reload work for `@import` in CSS?**
A: No. Use `styles` statements in Eligian instead:
```eligian
styles "./base.css"
styles "./extensions.css"
```

**Q: How many CSS files can I import?**
A: Up to 10 files recommended (success criterion SC-005). More files may impact performance.

---

## Next Steps

- **Learn More**: Read [Feature Spec](./spec.md) for complete requirements
- **Implementation**: See [Plan](./plan.md) for technical details
- **Report Issues**: File issues at [GitHub Issues](https://github.com/eligian/eligian/issues)

---

## Verified Working Examples

These examples have been tested and confirmed working in VS Code (2025-10-25):

### ✅ Example: Basic CSS Import with Hot-Reload

**Tested Scenario**: Import CSS file, modify it, verify hot-reload.

**File Structure**:
```
test-presentation/
  presentation.eligian
  test-preview.css
  layout.html
```

**File**: `presentation.eligian`
```eligian
styles "./test-preview.css"
layout "./layout.html"

timeline raf {
  at 0s..10s selectElement("#title") for 1s
}
```

**File**: `test-preview.css`
```css
#title {
  color: red;
  font-size: 48px;
}
```

**Verified Behavior**:
1. ✅ Open preview → CSS loads, title is red
2. ✅ Change `color: red` to `color: blue` and save
3. ✅ CSS hot-reloads in <300ms
4. ✅ Title turns blue instantly
5. ✅ Timeline continues playing (no restart)

---

### ✅ Example: Multiple CSS Files

**Tested Scenario**: Import multiple CSS files, verify load order.

**File**: `presentation.eligian`
```eligian
styles "./base.css"
styles "./theme.css"

layout "./layout.html"

timeline raf {
  at 0s..10s selectElement("#content") for 1s
}
```

**File**: `base.css`
```css
#content {
  padding: 20px;
  color: black;  /* Will be overridden */
}
```

**File**: `theme.css`
```css
#content {
  color: blue;  /* Overrides base.css */
}
```

**Verified Behavior**:
1. ✅ Both CSS files load in order
2. ✅ `theme.css` overrides `base.css` (content is blue)
3. ✅ Modifying either file triggers hot-reload
4. ✅ CSS cascade works correctly

---

### ✅ Example: CSS with Images (URL Rewriting)

**Tested Scenario**: CSS with `url()` paths to images.

**File Structure**:
```
test-presentation/
  presentation.eligian
  styles/
    main.css
    images/
      bg.png
```

**File**: `styles/main.css`
```css
body {
  background-image: url('./images/bg.png');
  background-size: cover;
}
```

**Verified Behavior**:
1. ✅ Image paths rewritten to webview URIs automatically
2. ✅ Background image loads correctly in preview
3. ✅ Hot-reload preserves image loading

---

### ✅ Example: Error Handling

**Tested Scenario**: Import non-existent CSS file.

**File**: `presentation.eligian`
```eligian
styles "./missing.css"  // File doesn't exist

timeline raf {
  at 0s..10s selectElement("#title") for 1s
}
```

**Verified Behavior**:
1. ✅ Error notification appears: "Asset file not found: ./missing.css"
2. ✅ Preview continues to work (doesn't crash)
3. ✅ Create `missing.css` → Auto-loads on next compilation
4. ✅ Fix path in `.eligian` and save → Loads correctly

---

## Testing Checklist (Phase 6 Validation)

All manual tests completed successfully:

- [x] **T031**: CSS loads within 500ms ✅
- [x] **T032**: Multiple CSS files load in correct order ✅
- [x] **T033**: Add CSS import to open preview (recompile works) ✅
- [x] **T034**: CSS reloads within 300ms after save ✅
- [x] **T035**: Timeline continues playing during CSS reload ✅
- [x] **T036**: Modify one CSS file → only that file reloads ✅
- [x] **T037**: CSS reload during animation doesn't interrupt ✅
- [x] **T038**: Delete CSS file → error notification appears ✅
- [x] **T039**: Fix CSS file after error → auto-reload works ✅
- [x] **T040**: Error notifications are clear and actionable ✅
- [x] **T041**: CSS with relative paths (images/fonts) resolves correctly ✅
- [x] **T042**: Rapid file changes (auto-save) → debouncing works ✅
- [x] **T043**: Load 10 CSS files → performance acceptable ✅
- [x] **T044**: Quickstart guide validation → all steps work ✅

**Status**: All Phase 6 manual tests PASSED ✅

---

## References

- Feature Specification: [spec.md](./spec.md)
- Implementation Plan: [plan.md](./plan.md)
- Data Model: [data-model.md](./data-model.md)
- Message Protocol: [contracts/webview-messages.md](./contracts/webview-messages.md)
- Component API: [contracts/components.md](./contracts/components.md)
