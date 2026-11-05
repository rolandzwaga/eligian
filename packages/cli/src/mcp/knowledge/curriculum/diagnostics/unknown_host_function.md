---
code: unknown_host_function
---

**Cause:** a warning: `customFunction("<name>")` names a function that the program's `extensions` import does not declare, so nothing provides it at runtime. **Fix:** use one of the declared names the message lists, or declare the function: `extensions "./host.ts" { function <name> }`, and export a function of that name from the host module.
