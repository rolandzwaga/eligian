---
code: unknown-listener-action
---

**Cause:** an error: a name in the action list of a raw `addController("DOMEventListenerController", "<event>", ["a", "end:b"])` or `addController("KeyboardController", …, [ … ])` is not an action the program declares or imports. An `end:` prefix (run the action's end operations) is stripped before the lookup. The engine would fail at runtime when the event fires. **Fix:** correct the spelling (the diagnostic carries suggestions), declare the action, or import it from its library (`import { name } from "./lib.eligian"`). Simpler still: use the interaction form, `on click "<selector>" run name(…)`, which the validator resolves like any call.
