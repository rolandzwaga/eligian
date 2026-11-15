---
code: unknown_operation
---

**Cause:** a call names neither an action in scope nor a built-in operation, nor a host operation declared in an `extensions` block. **Fix:** use one of the `suggestions` if it is a typo (`eligian_operations` lists every operation); otherwise define the action (`action name(…) [ … ]`) or import it from a library (`import { name } from "./lib.eligian"`). App-specific JavaScript operations must be declared in an `extensions` block.
