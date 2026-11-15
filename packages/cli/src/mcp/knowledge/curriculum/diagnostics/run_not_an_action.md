---
code: run_not_an_action
---

**Cause:** an interaction `on <event> "<sel>" run name(…)` names a built-in operation. `run` starts an action: the DOM event listener runs actions, not operations. **Fix:** wrap the operations in an action and run that: `action highlight [ selectElement("#box") toggleClass("on") ]`, then `on click "#btn" run highlight()`. A name that is neither an action nor an operation is reported as unknown instead.
