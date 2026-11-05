---
code: sequence-item-duration-not-positive
---

**Cause:** an item of a `sequence { … }` has a duration of zero or less (`fadeIn() for 0s`, `for -2s`). Each item occupies its own slot, one after the other, so it needs a length. **Fix:** give the item a positive duration (`intro() for 2s`), or remove the item. With a constant (`for @beat`), check the value it resolves to.
