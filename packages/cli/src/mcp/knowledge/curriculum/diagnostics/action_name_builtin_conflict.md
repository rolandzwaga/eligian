---
code: action_name_builtin_conflict
---

**Cause:** an action is named like an operation, so a call to it would be ambiguous: `action selectElement(…) [ … ]`, or a library import alias such as `import { fade as addClass } from "./lib.eligian"`. Operations declared in an `extensions` block count too. **Fix:** rename the action (and every call to it) or the alias to a name no operation uses, for example `highlightBox`; `eligian_operations` lists every operation name.
