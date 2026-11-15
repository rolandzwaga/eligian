---
code: event_label_time_unknown
---

**Cause:** a `seek` or `navigate … at` position uses a label whose time is not known at compile time. `seek` uses the labels of its own timeline, `navigate … at` those of the target timeline. **Fix:** label an event of the right timeline whose times resolve statically (literals, constants, earlier labels), or give the position as a time (`seek 12s`).
