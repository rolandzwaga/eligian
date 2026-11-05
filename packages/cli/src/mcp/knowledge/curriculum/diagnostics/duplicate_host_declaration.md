---
code: duplicate_host_declaration
---

**Cause:** the `extensions` block declares the same `operation`, `controller` or `function` name twice (the message names the kind and the name). **Fix:** delete the repeated declaration, or rename it if it was meant to be a different export of the host module. An operation and a controller may share a name; two of the same kind may not.
