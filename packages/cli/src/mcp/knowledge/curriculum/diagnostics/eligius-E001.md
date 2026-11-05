---
code: eligius-E001
---

**Cause:** Eligius' lint of the compiled configuration: the engine's own configuration resolver rejects it, so `createEngine` would throw. The message is the engine's, with the JSON path; typical causes are a name that nothing registers (an operation, controller or timeline provider) or a malformed section. **Fix:** read the message and change the source at the reported location; declare a host operation or controller in the `extensions` block. A program with errors of its own is not linted: fix those first.
