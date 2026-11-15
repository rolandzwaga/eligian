---
code: library_invalid_content
---

**Cause:** a `library <name>` file contains something other than action definitions. A library holds only `import { … } from "./other.eligian"` lines and `action` / `endable action` definitions (optionally `private`); timelines, constants and `styles` or `layout` imports are not allowed, and the parser usually reports them first. **Fix:** move the other declarations into the program that imports the library and keep only actions in the library.
