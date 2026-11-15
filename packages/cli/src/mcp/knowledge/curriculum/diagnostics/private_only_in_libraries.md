---
code: private_only_in_libraries
---

**Cause:** an action in a program file is declared `private`. The modifier hides an action from importers, so it is only allowed in a `library` file. **Fix:** remove `private` from the action. To keep a helper away from other files, move it into a library file (`library name`, actions only), mark it `private` there, and import the public actions: `import { intro } from "./lib.eligian"`.
