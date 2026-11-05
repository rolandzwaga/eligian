---
code: compile-failed
---

**Cause:** a program that checks clean (no errors) does not compile; `eligian check` and `eligian_check` add this error on line 1 when their lint or review pass compiles it, and the message (`checks clean but does not compile: …`) carries the compiler's reason. **Fix:** read that reason: it usually names an imported library, an asset that cannot be loaded or a construct to change; fix it and check again. If it names nothing in your files, it is an Eligian bug: report it with the smallest program that shows it.
