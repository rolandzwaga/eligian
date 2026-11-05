---
code: event_action_empty_body
---

**Cause:** an `on event "<name>" action <handler>() [ ]` has no operations in its body, so answering the event does nothing. **Fix:** put at least one operation between the brackets, for example `on event "timeline-complete" action done() [ selectElement("#end") addClass("visible") ]`, or delete the event action.
