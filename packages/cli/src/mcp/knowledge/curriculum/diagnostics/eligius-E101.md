---
code: eligius-E101
---

**Cause:** Eligius' lint of the compiled configuration: the control-flow operations of one list do not balance or nest: a `when` or `forEach` without its `endWhen` / `endForEach`, a closer without an opener, a second `otherwise`, or blocks that overlap. The engine then pops the wrong scope. **Fix:** write control flow with the DSL's `if` / `else` and `for` blocks, which always compile balanced, instead of raw `when`, `otherwise`, `endWhen`, `forEach`, `endForEach` calls; if you keep raw calls, close the blocks in reverse order.
