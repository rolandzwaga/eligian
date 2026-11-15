---
code: unnecessary_type_annotation
---

**Cause:** a warning: a parameter of an event action (`on event "<name>" action handler(…)`) carries a type annotation, but the event passes no argument at that position, so the parameter is never set. **Fix:** remove the parameter (or at least its annotation). The `events` chunk lists each event's arguments in order; keep only as many parameters as the event provides.
