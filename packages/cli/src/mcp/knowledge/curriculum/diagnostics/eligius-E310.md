---
code: eligius-E310
---

**Cause:** Eligius' lint of the compiled configuration: `requestAction` names an action that the configuration does not have; the message suggests close names when there are any. **Fix:** call the action by name with the unified call syntax (`fadeIn("#box")`), which the compiler checks and expands, instead of a raw `requestAction("…")`; otherwise correct the name to an action the program defines or imports.
