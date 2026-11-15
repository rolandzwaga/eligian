---
code: operation-in-timeline-event
---

**Cause:** a timeline event calls a built-in operation directly, e.g. `at 0s..2s addClass("on")`. The call of a timed event must be an action (local or imported). **Fix:** put the operations in a block on the event, a start block and an optional end block: `at 0s..2s target "#box" [ addClass("on") ] [ removeClass("on") ]`; or define an `action` / `endable action` that calls them and call that action from the event: `at 0s..2s highlight("#box")`.
