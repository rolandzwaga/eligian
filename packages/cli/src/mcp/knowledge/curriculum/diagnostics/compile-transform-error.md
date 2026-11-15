---
code: compile-transform-error
---

**Cause:** the program validated without errors, but turning it into an Eligius configuration failed; the message names the construct. Known causes: an HTML import that cannot be loaded, two library actions that emit the same action name (Eligius action names are global), an expression that is not valid in its position. **Fix:** change what the message names: rename one of two clashing actions, correct the import path. If the message names nothing you wrote, it is an Eligian bug: report it with the smallest program.
