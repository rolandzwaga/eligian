---
code: unknown_event_name
---

**Cause:** `on event "<name>"` names neither one of Eligius' events nor an event that this program broadcasts itself. **Fix:** use one of the suggested names (the `events` docs list every Eligius event). For an event of your own, broadcast it somewhere in the program with a literal name: `broadcastEvent([], "<name>")` (the event name is the second argument).
