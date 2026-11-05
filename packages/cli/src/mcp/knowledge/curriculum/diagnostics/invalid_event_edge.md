---
code: invalid_event_edge
---

**Cause:** an event time reference names an edge other than `.start` or `.end` (for example `intro.begin` or `intro.stop`). An event labeled with `as intro` has exactly those two edges. **Fix:** write `intro.start` or `intro.end`, optionally with an offset: `at intro.end + 1s..intro.end + 3s [ … ]`.
