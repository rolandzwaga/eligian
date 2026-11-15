---
code: compile-emit-error
---

**Cause:** the program validated without errors, but the compiler's last stage, writing the Eligius JSON, failed; the message says why. No program construct is known to cause it. **Fix:** fix every other diagnostic in the file and its libraries first. If it remains, it is an Eligian bug: report it with the smallest program that shows it.
