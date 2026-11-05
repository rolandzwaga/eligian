---
code: OPERATION_NAME_CONFLICT
---

**Cause:** a named import (`import name from "./file"`) uses the name of a built-in operation, such as `import selectElement from "./x.html"`. **Fix:** choose a name that is not an operation, for example `import cardLayout from "./card.html"`; `eligian_operations` lists every operation name.
