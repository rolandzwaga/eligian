---
code: unknown_dom_event
---

**Cause:** a warning: the event of an interaction (`on <event> "<selector>" …`) is not a known DOM event name, so it is probably a typo; custom events are allowed, which is why it is only a warning. **Fix:** use one of the `suggestions` (`clik` → `click`). DOM event names are lower case without `on`: `click`, `input`, `change`, `mouseenter`, `keydown`. For keyboard shortcuts, use `on key "<keys>" …` instead. Keep the name only if the element really dispatches that custom event.
