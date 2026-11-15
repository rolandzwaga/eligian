---
code: stagger-duration-not-positive
---

**Cause:** the duration of a `stagger` block (the time after `for`) is zero or less, so no item would ever be active. **Fix:** give each item a positive duration: `stagger 200ms [".a", ".b"] with fadeIn() for 2s`, or `stagger 200ms items for 1s [ … ] [ … ]` with inline blocks. With a constant (`for @beat`), check the value it resolves to.
