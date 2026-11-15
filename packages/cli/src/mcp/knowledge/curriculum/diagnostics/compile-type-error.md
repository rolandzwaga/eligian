---
code: compile-type-error
---

**Cause:** the program validated without errors, but the compiled configuration failed its final sanity check: an empty configuration id, a non-string `containerSelector` or `language`, or no timeline at all (`Configuration must have at least one timeline`). **Fix:** for a missing timeline, add one: `timeline "main" in "#app" using raf { at 0s..5s … }`. The other three come from the compiler itself: report them as an Eligian bug with the smallest program.
