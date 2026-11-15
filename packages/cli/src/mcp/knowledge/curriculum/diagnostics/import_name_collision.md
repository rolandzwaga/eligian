---
code: import_name_collision
---

**Cause:** an imported action name (the alias, when `as` is used) is imported twice, or it equals an action defined in the importing file, so calls would be ambiguous. **Fix:** import each action once, rename the local action, or give the import an alias: `import { fadeIn as libFadeIn } from "./lib.eligian"`, then call `libFadeIn(…)`.
