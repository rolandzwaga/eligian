# Quickstart Guide: Custom Action Reference Provider

**Feature**: "Go to Definition" for Custom Actions
**Date**: 2025-10-24
**Estimated Time**: 5-10 minutes

## Prerequisites

- VS Code with Eligian extension installed
- Eligian project with `.eligian` files
- Familiarity with Eligian DSL syntax (actions, timelines)

## What You'll Learn

By the end of this guide, you'll be able to:
1. Navigate from custom action calls to action definitions using Ctrl+Click
2. Use "Go to Definition" (F12) to jump to action implementations
3. Use "Find All References" (Shift+F12) to see all action call sites
4. Navigate action calls in all timeline contexts (inline blocks, sequences, staggers)

## Step 1: Create a Test File

Create a new file `action-navigation-test.eligian` with the following content:

```eligian
// Define custom actions
action fadeIn(selector, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

action slideIn(selector, distance, duration) [
  selectElement(selector)
  animate({transform: `translateX(${distance}px)`}, duration)
]

action compositeAnimation(selector) [
  fadeIn(selector, 1000)
  slideIn(selector, 100, 500)
]

// Timeline with action calls
timeline video {
  // Direct timeline call
  at 0s..1s fadeIn("#box1", 1000)

  // Inline endable action block
  at 1s..4s [ slideIn("#box2", 100, 2000) ] [ fadeIn("#box3", 500) ]

  // Sequence block
  at 5s..10s sequence {
    fadeIn("#box4") for 1s,
    slideIn("#box5", 50, 1s) for 2s
  }

  // Stagger block
  at 10s..15s stagger 200ms [".item"] with fadeIn() for 1s

  // Composite action (action calling other actions)
  at 15s..20s compositeAnimation("#final")
}
```

## Step 2: Test "Go to Definition" - Direct Call

1. **Open** `action-navigation-test.eligian` in VS Code
2. **Navigate** to line 21 (direct timeline call): `at 0s..1s fadeIn("#box1", 1000)`
3. **Ctrl+Click** on `fadeIn` in the call
   - **Expected**: Cursor jumps to line 2 (action definition)
   - **Alternative**: Press F12 while cursor is on `fadeIn`
4. **Verify**: Cursor is now on the `action fadeIn(selector, duration)` line

✅ **Success Indicator**: Cursor jumped to action definition, highlighting `fadeIn` name

## Step 3: Test "Go to Definition" - Inline Block

1. **Navigate** to line 24 (inline block): `at 1s..4s [ slideIn(...) ] [ fadeIn(...) ]`
2. **Ctrl+Click** on `slideIn` in the start block
   - **Expected**: Cursor jumps to line 7 (slideIn action definition)
3. **Return** to line 24 (Ctrl+Alt+- or back button)
4. **Ctrl+Click** on `fadeIn` in the end block
   - **Expected**: Cursor jumps to line 2 (fadeIn action definition)

✅ **Success Indicator**: Both inline block action calls navigate correctly

## Step 4: Test "Go to Definition" - Sequence Block

1. **Navigate** to line 27 (sequence block): `sequence { fadeIn(...) for 1s, ... }`
2. **Ctrl+Click** on `fadeIn` in the sequence
   - **Expected**: Cursor jumps to line 2
3. **Return** to line 28 (next sequence item)
4. **Ctrl+Click** on `slideIn`
   - **Expected**: Cursor jumps to line 7

✅ **Success Indicator**: All sequence block calls navigate correctly

## Step 5: Test "Go to Definition" - Stagger Block

1. **Navigate** to line 32 (stagger block): `stagger 200ms [".item"] with fadeIn() for 1s`
2. **Ctrl+Click** on `fadeIn`
   - **Expected**: Cursor jumps to line 2

✅ **Success Indicator**: Stagger block call navigates correctly

## Step 6: Test "Go to Definition" - Recursive Actions

1. **Navigate** to line 13 (inside `compositeAnimation` action): `fadeIn(selector, 1000)`
2. **Ctrl+Click** on `fadeIn`
   - **Expected**: Cursor jumps to line 2 (fadeIn definition)
3. **Return** to line 14
4. **Ctrl+Click** on `slideIn`
   - **Expected**: Cursor jumps to line 7 (slideIn definition)

✅ **Success Indicator**: Action-to-action navigation works (actions calling other actions)

## Step 7: Test "Find All References"

1. **Navigate** to line 2 (fadeIn action definition)
2. **Place cursor** on `fadeIn` name in the definition
3. **Press Shift+F12** (or right-click → "Find All References")
4. **Expected References Panel** shows 5 references:
   - Line 13: `fadeIn(selector, 1000)` (inside compositeAnimation)
   - Line 21: `fadeIn("#box1", 1000)` (direct call)
   - Line 24: `fadeIn("#box3", 500)` (inline block end)
   - Line 28: `fadeIn("#box4")` (sequence block)
   - Line 32: `fadeIn()` (stagger block)

✅ **Success Indicator**: References panel shows all 5 call sites with correct line numbers

## Step 8: Test "Peek Definition"

1. **Navigate** to line 21: `at 0s..1s fadeIn("#box1", 1000)`
2. **Place cursor** on `fadeIn`
3. **Press Alt+F12** (or right-click → "Peek Definition")
4. **Expected**: Inline peek window shows fadeIn action definition (lines 2-5)
5. **Press Escape** to close peek window

✅ **Success Indicator**: Peek window shows action definition inline without navigating

## Step 9: Test Non-Existent Action (Error Handling)

1. **Add a new line** at the end of the timeline:
   ```eligian
   at 20s..21s unknownAction()
   ```
2. **Ctrl+Click** on `unknownAction`
   - **Expected**: No navigation occurs (no definition found)
   - **Expected**: Validation error shown: "Unknown operation: unknownAction"
3. **Hover** over `unknownAction`
   - **Expected**: Tooltip shows error message with hint

✅ **Success Indicator**: Invalid action calls don't crash, show clear error

## Step 10: Test Multiple Actions

1. **Navigate** to line 35: `compositeAnimation("#final")`
2. **Ctrl+Click** on `compositeAnimation`
   - **Expected**: Cursor jumps to line 12 (compositeAnimation definition, NOT fadeIn or slideIn)

✅ **Success Indicator**: Correct action is resolved when multiple actions exist

## Troubleshooting

### Navigation Doesn't Work

**Symptom**: Ctrl+Click does nothing, no navigation occurs

**Possible Causes**:
1. **Extension not activated**: Restart VS Code
2. **File not parsed**: Check for syntax errors (red squiggles)
3. **Cursor not on action name**: Ensure cursor is exactly on the action identifier

**Solution**:
- Open VS Code Developer Tools (Help → Toggle Developer Tools)
- Check Console for errors
- Reload window (Ctrl+Shift+P → "Reload Window")

### Wrong Definition Opened

**Symptom**: Navigation jumps to wrong action or wrong file

**Possible Causes**:
1. **Duplicate action names**: Validator should prevent this
2. **Name collision with operation**: Validator should prevent this

**Solution**:
- Check Problems panel (Ctrl+Shift+M) for validation errors
- Rename action to ensure uniqueness

### "Find All References" Shows Nothing

**Symptom**: References panel is empty or shows "No references found"

**Possible Causes**:
1. **Action is defined but never called**: Expected behavior
2. **Index not updated**: Langium index needs refresh

**Solution**:
- Verify action is actually called somewhere in the file
- Reload window to refresh index

### Performance Issues (Slow Navigation)

**Symptom**: Navigation takes >1 second, IDE feels sluggish

**Possible Causes**:
1. **Very large file**: 100+ action definitions
2. **Deep nesting**: Complex timeline structures

**Solution**:
- Check file size (should be <10,000 lines)
- Report performance issue if <100 actions and still slow

## Verification Checklist

After completing this quickstart, verify:

- [x] Direct timeline calls navigate to action definitions
- [x] Inline block calls navigate correctly (both start and end blocks)
- [x] Sequence block calls navigate correctly
- [x] Stagger block calls navigate correctly
- [x] Action-to-action calls navigate correctly (recursive actions)
- [x] "Find All References" shows all call sites
- [x] "Peek Definition" shows inline preview
- [x] Invalid action calls show validation errors
- [x] Multiple actions resolve to correct definitions
- [x] Navigation is fast (<1 second)

## Next Steps

### Advanced Usage

1. **Cross-File Actions** (Future):
   - Currently limited to single-file references
   - Future: Import actions from other files

2. **Rename Refactoring** (Future):
   - Currently: Manual find/replace
   - Future: Rename action updates all call sites

3. **Hover Hints** (Future):
   - Currently: No hover information for actions
   - Future: Show action signature and documentation

### Integration with Development Workflow

1. **Code Review**:
   - Use "Find All References" to see action usage before refactoring
   - Verify all call sites match expected signature

2. **Debugging**:
   - Use "Go to Definition" to quickly inspect action implementation
   - Navigate from timeline to action to understand behavior

3. **Refactoring**:
   - Use references to identify unused actions (0 references)
   - Use navigation to update action implementations consistently

## Support

**Documentation**: See `specs/007-custom-action-reference/` for full specification
**Bug Reports**: File issue with reproduction steps if navigation doesn't work
**Feature Requests**: Suggest improvements to cross-reference experience

---

**Quickstart Complete!** 🎉

You've successfully verified "Go to Definition" functionality for custom actions across all timeline contexts. You can now navigate Eligian codebases efficiently using standard IDE features.
