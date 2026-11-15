---
code: empty_event_name
---

**Cause:** an event action names its event with an empty string, as in `on event "" action handler() [ … ]`. **Fix:** write the event's name between the quotes: one of Eligius' events (the `events` docs list them) or a custom event that the program broadcasts. A missing or non-literal name is `event_name_must_be_literal`.
