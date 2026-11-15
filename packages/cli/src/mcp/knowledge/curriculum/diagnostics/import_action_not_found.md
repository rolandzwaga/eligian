---
code: import_action_not_found
---

**Cause:** `import { name } from "./lib.eligian"` names an action that the library does not define (the message may add `Did you mean: …?`). **Fix:** use the suggested name if it is a typo, add the action to the library, or remove it from the import list. Names are case-sensitive; compare with the `action` names in the library file.
