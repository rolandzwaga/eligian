---
code: compile-parse-error
---

**Cause:** the program validated without errors, but the compiler could not parse or load its sources. Usually an imported library: it cannot be read or parsed, is not a `library` file, or the libraries import each other in a cycle. A problem in a library is reported on line 1 with `(in <file>)` in the message. **Fix:** run `eligian_check` on the file the message names, fix its errors, then check the program again.
