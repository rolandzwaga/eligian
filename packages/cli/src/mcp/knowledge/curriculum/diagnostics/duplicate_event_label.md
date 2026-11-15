---
code: duplicate_event_label
---

**Cause:** two events (`at 0s..2s as intro …`) or sequence items (`… for 5s as intro`) in one timeline share a label; the later one is reported. A label names one event for `intro.start` / `intro.end`, so it must be unique within its timeline. **Fix:** rename the later label and every reference to it. Labels in different timelines may repeat.
