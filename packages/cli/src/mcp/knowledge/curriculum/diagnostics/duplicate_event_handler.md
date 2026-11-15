---
code: duplicate_event_handler
---

**Cause:** a warning: two or more `on event "name" action …` definitions listen to the same event name with the same topic (or both without one); each of them is flagged. All of them run when the event fires, which is rarely intended. **Fix:** merge the bodies into one handler, or give each a distinct `topic "…"` when they serve different publishers.
