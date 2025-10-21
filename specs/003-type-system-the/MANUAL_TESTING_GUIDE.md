# Manual Testing Guide: User Story 1

**File**: `examples/type-checking-manual-test.eligian`

---

## Quick Test

```bash
# Verify file has intentional type errors:
node packages/cli/bin/cli.js --check examples/type-checking-manual-test.eligian

# Expected: Type errors on lines 25, 36, 37, 48, 51, 54
```

---

## VS Code Testing

1. Open VS Code: `code f:/projects/eligius/eligian`
2. Press F5 (start extension development)
3. Open: `examples/type-checking-manual-test.eligian`

### T034-T035: Red Squiggles & Error Messages

Check these lines for red squiggles:
- **Line 25**: `animate({opacity: 1}, "slow")` - squiggle on `"slow"`
- **Line 36**: `selectElement(123)` - squiggle on `123`
- **Line 37**: `animate("not an object", "not a number")` - squiggles on both args
- **Line 48**: `fadeIn(123, 500)` - squiggle on `123`
- **Line 51**: `fadeIn("#element", "slow")` - squiggle on `"slow"`
- **Line 54**: `fadeIn(999, "very slow")` - squiggles on both args

Hover over squiggles → should show type mismatch messages

### T036: Performance

Type a new error and measure time to squiggle appearance (< 500ms expected)

### T038: Action Parameter Validation

Lines 48, 51, 54 show action call type validation

---

## Pass Criteria

- [ ] Red squiggles appear at error locations
- [ ] Hover shows type mismatch messages
- [ ] Errors appear within 500ms
- [ ] NO errors on correct code (lines 45, 60-67)

---

## Done

If tests pass → Mark T034-T038 complete in tasks.md
