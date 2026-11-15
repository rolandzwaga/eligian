---
code: duplicate_parameter
---

**Cause:** an action (regular, endable or event action) lists the same parameter name twice, as in `action show(selector, selector)`. Parameters become properties of the operation data, so one would overwrite the other. **Fix:** rename one of them, or delete it, and update the call sites so the arguments still line up: arguments are positional.
