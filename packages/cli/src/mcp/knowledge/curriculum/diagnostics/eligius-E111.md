---
code: eligius-E111
---

**Cause:** Eligius' lint of the compiled configuration: an operation needs a required property, and neither its own arguments nor an operation before it in the same list provides it, so it fails when it runs. The message names the operation and the property. **Fix:** pass the argument at the reported source location (`eligian_operations` and the `operation/<name>` docs list the required parameters), or add an earlier operation in the same block that outputs that property.
