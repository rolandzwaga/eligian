---
code: compile-validation-error
---

**Cause:** the program itself validated without errors, but the compiler found a validation error while compiling: usually in an imported library, which a check of the program does not report. A library problem is reported on line 1 with `(in <file>)` in the message. **Fix:** run `eligian_check` on the library the message names, fix its errors, then check the program again.
