---
code: if-empty-then
---

**Cause:** a warning: an `if (…) { }` has no operations in its then branch, so the condition guards nothing. **Fix:** put the operations in the then branch, or negate the condition and move the `else` operations into it; delete the `if` if it is left over.
