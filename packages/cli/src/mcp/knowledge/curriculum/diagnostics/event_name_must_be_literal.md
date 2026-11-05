---
code: event_name_must_be_literal
---

**Cause:** an `on event` has no event name, or a name that is not a string literal (`on event myVar action foo()`). **Fix:** write the event name as a quoted string: `on event "timeline-complete" action done() [ … ]`. Names cannot come from variables or constants.
