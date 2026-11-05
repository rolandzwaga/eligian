---
code: eligius-E141
---

**Cause:** Eligius' lint of the compiled configuration: an object argument contains a `__proto__` key, at any depth. The engine rejects the operation when it runs. **Fix:** rename that key in the object literal at the reported source location; `__proto__` cannot be a data key.
