---
code: event-start-negative
---

**Cause:** a timed event starts before 0 seconds (`at -1s..5s`, or a constant expression such as `@beat - 5s` that resolves below zero). A timeline starts at 0. **Fix:** make the start 0 or later (`at 0s..5s`); with constants and labels, check the value the start resolves to.
