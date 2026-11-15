---
code: smoke-host-export-missing
---

**Cause:** a smoke error: the `extensions "./host.ts" { … }` block declares an operation, controller or function that the host module does not export. The message names the module and the missing export. **Fix:** export it from the module under exactly the declared name, or remove the declaration from the `extensions` block if it is not used.
