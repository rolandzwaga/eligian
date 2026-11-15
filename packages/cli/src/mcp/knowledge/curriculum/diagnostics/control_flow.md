---
code: control_flow
---

**Cause:** raw `when` / `otherwise` / `endWhen` or `forEach` / `endForEach` calls do not pair up in one operation list: an `endWhen` or `endForEach` without its opener, an `otherwise` outside a `when`, or a `when` / `forEach` never closed. Every list, each `if` branch and `for` body included, must balance on its own. **Fix:** write the DSL forms, which compile to balanced pairs: `if (cond) { … } else { … }` and `for (item in items) { … }`. Otherwise add the missing call in the same list, as the message's hint says.
