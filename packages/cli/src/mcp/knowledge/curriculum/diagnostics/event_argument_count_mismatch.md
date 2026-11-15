---
code: event_argument_count_mismatch
---

**Cause:** a warning: the event action declares more parameters than the Eligius event supplies arguments, so the extra parameters (named in the message) are `undefined` at runtime. **Fix:** remove the extra parameters, keeping as many as the event provides (the `events` docs list each event's arguments). Declaring fewer parameters than the event supplies is fine.
