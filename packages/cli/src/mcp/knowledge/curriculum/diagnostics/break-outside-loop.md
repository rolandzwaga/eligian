---
code: break-outside-loop
---

**Cause:** `break` is used outside a `for` loop. It compiles to Eligius' `breakForEach`, which only works inside a loop. **Fix:** move it inside `for (item in items) { … }` (typically under an `if`), or remove it and use `if` / `else` to skip the remaining operations.
