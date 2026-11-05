---
code: event-end-not-after-start
---

**Cause:** a timed event's end time is not after its start time (`at 5s..3s`, `at 2s..2s`). **Fix:** correct the times so the end is later, or give a duration instead of an end: `at 2s for 3s`. With constants and labels, check the values they resolve to.
