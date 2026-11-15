---
code: event_label_not_before
---

**Cause:** a time refers to `<label>.start` or `<label>.end` of an event labeled later in the timeline, or of the event it is in. A time can only refer to earlier events. **Fix:** move the labeled event (`at … as intro`) above the event that refers to it, or write the time out as a literal or a `const`.
