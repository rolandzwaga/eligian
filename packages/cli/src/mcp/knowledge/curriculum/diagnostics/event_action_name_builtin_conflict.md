---
code: event_action_name_builtin_conflict
---

**Cause:** a warning: an event action is named like a built-in operation (`on event "timeline-complete" action addClass() [ … ]`). Event actions are never called, so it compiles, but the name is confusing next to the operation. **Fix:** rename the event action to describe what it does, such as `onComplete`.
