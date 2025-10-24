# Quickstart Guide: Custom Action Code Completions

**Feature**: 008-custom-action-code
**Audience**: Eligian DSL developers using VS Code extension

---

## What This Feature Does

When you trigger code completion (Ctrl+Space) while writing Eligian code, the IDE now shows **both** built-in operations and your custom actions in the same list. Each item is clearly labeled:

- **`operation:`** - Built-in Eligius operations (e.g., `selectElement`, `addClass`)
- **`action:`** - Your custom actions defined in the file (e.g., `fadeIn`, `slideIn`)

The list is sorted alphabetically by name, making it easy to find what you need.

---

## Quick Example

### 1. Define a Custom Action

```eligian
action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  setStyle({opacity: 0})
  animate({opacity: 1}, duration)
]
```

### 2. Use Code Completion

In a timeline event, start typing and press **Ctrl+Space**:

```eligian
timeline "main" in ".container" using raf {
  at 0s..2s fadeI▊  // Press Ctrl+Space here
}
```

### 3. See Both Operations and Actions

The completion list shows:

```
action: fadeIn
operation: addClass
operation: animate
operation: selectElement
operation: setStyle
operation: wait
...
```

### 4. Select and Insert

When you select `action: fadeIn`, only `fadeIn` is inserted (prefix removed):

```eligian
at 0s..2s fadeIn("#box", 1000)
```

---

## How to Use

### Triggering Completion

Code completion works in these contexts:

1. **Timeline Events**:
   ```eligian
   at 0s..1s ▊  // Type here, press Ctrl+Space
   ```

2. **Action Bodies**:
   ```eligian
   action myAction [
     ▊  // Type here, press Ctrl+Space
   ]
   ```

3. **Control Flow (if/else)**:
   ```eligian
   if (@@condition) {
     ▊  // Type here, press Ctrl+Space
   }
   ```

4. **For Loops**:
   ```eligian
   for (item in items) {
     ▊  // Type here, press Ctrl+Space
   }
   ```

5. **Sequences and Staggers**:
   ```eligian
   at 0s..5s sequence {
     ▊ for 1s  // Type here, press Ctrl+Space
   }
   ```

### Understanding the List

**Prefixes**:
- `operation:` - Built-in Eligius operations (from operation registry)
- `action:` - Custom actions you've defined in the current file

**Sorting**:
- Alphabetical by **name** (ignoring prefix)
- Example order: `addClass`, `fadeIn`, `selectElement`, `setup`, `wait`
- Actions and operations are interleaved

**Filtering**:
- Type partial name to filter: `sel` shows `selectElement` and `selectCustom`
- Filters match the actual name, not the prefix

---

## Tips

### 1. Discovering Your Actions

Trigger completion to see all custom actions defined in your file - no need to scroll through the file looking for action definitions!

### 2. Distinguishing Operations vs Actions

The prefix makes it immediately clear whether you're using a built-in operation or a custom action. This is especially helpful when reading code later.

### 3. Consistent Naming

If an action name conflicts with an operation name, you'll get a validation error. The completion list will only show unique names.

### 4. Real-Time Updates

When you add a new action to your file, it immediately appears in the completion list (within 1 second).

---

## Examples

### Example 1: Animation Actions

```eligian
action fadeIn(el: string) [
  selectElement(el)
  setStyle({opacity: 0})
  animate({opacity: 1}, 1000)
]

action fadeOut(el: string) [
  selectElement(el)
  animate({opacity: 0}, 1000)
]

action slideIn(el: string) [
  selectElement(el)
  setStyle({transform: "translateX(-100%)"})
  animate({transform: "translateX(0)"}, 500)
]

timeline "demo" in ".container" using raf {
  // Press Ctrl+Space after typing "fa"
  at 0s..1s fadeIn("#box")    // Select "action: fadeIn"
  at 2s..3s fadeOut("#box")   // Select "action: fadeOut"
  at 4s..5s slideIn("#title") // Select "action: slideIn"
}
```

**Completion list after typing "fa"**:
```
action: fadeIn
action: fadeOut
```

### Example 2: Setup Actions

```eligian
action initializeApp() [
  selectElement("body")
  addClass("loaded")
  wait(100)
]

action setupEventHandlers() [
  selectElement(".btn")
  addEventListener("click", handleClick)
]

timeline "init" in ".app" using raf {
  // Press Ctrl+Space to see all actions
  at 0s initializeApp()
  at 0s setupEventHandlers()
}
```

**Completion list**:
```
action: initializeApp
action: setupEventHandlers
operation: addClass
operation: addEventListener
operation: selectElement
operation: wait
...
```

### Example 3: Mixed Usage in Control Flow

```eligian
action highlight(selector: string) [
  selectElement(selector)
  addClass("highlight")
]

action processItem(item) [
  if (@@condition) {
    highlight(item)  // Custom action call
    wait(500)        // Built-in operation
  } else {
    removeClass("highlight")  // Built-in operation
  }
]
```

Completion works inside if/else blocks, showing both operations and actions.

---

## Testing the Feature

### Manual Test

1. Open a `.eligian` file in VS Code
2. Define a custom action (e.g., `action test() []`)
3. Go to a timeline event or action body
4. Press **Ctrl+Space**
5. Verify:
   - Action appears with `action:` prefix
   - Operations appear with `operation:` prefix
   - List is alphabetically sorted
   - Selecting `action: test` inserts only `test`

### Performance Test

1. Create a file with 20+ custom actions
2. Trigger completion
3. Verify list appears within ~200ms
4. Verify all actions are included

---

## Troubleshooting

### Q: I don't see my custom action in the list

**Check**:
- Is the action defined in the same file?
- Is the action syntax correct? (No parse errors?)
- Try re-triggering completion (Ctrl+Space)

### Q: Completion shows wrong text when I select an item

**This shouldn't happen**. If it does:
- Report as bug with example code
- Workaround: Type the name manually

### Q: List is not sorted correctly

**Check**:
- Sorting is by name (after prefix), not by prefix
- Example: `action: zebra` comes after `operation: alpha`

### Q: Can I filter by prefix?

**No** - filtering matches the **name** only, not the prefix.
- Typing "oper" won't filter to show only operations
- Typing "sel" will show both `operation: selectElement` and `action: selectCustom`

---

## Related Features

- **Feature 006**: Unified action call syntax (actions and operations called identically)
- **Feature 007**: Custom action reference provider (Ctrl+Click "Go to Definition")
- **Future**: Hover hints for custom actions (show parameter info on hover)

---

## Keyboard Shortcuts

- **Trigger Completion**: `Ctrl+Space` (Windows/Linux) / `Cmd+Space` (Mac)
- **Accept Selected**: `Enter` or `Tab`
- **Cancel**: `Esc`
- **Navigate List**: `↑` / `↓` arrow keys
- **Filter**: Just start typing

---

## Summary

- **What**: Code completion now includes custom actions with clear prefixes
- **Where**: Works in all operation contexts (timeline, actions, control flow)
- **How**: Press Ctrl+Space, see list with `operation:` and `action:` prefixes
- **Result**: Faster development with better discoverability of custom actions

Enjoy more productive Eligian DSL development! 🚀
