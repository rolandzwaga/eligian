---
code: event-ends-after-timeline
---

**Cause:** a warning: the event ends after the timeline's `duration` header (`duration 10s` with `at 8s..12s`), so its end is never reached and its end operations never run. **Fix:** end the event at or before the duration (`at 8s..10s`), or raise the timeline's `duration` so the whole range fits.
