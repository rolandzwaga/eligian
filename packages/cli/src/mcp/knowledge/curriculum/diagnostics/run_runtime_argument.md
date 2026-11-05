---
code: run_runtime_argument
---

**Cause:** an argument of `on <event> "<sel>" run action(…)` depends on a runtime value: an action parameter, a property chain such as `$operationdata.x`, a system property, or a const derived from one. The arguments are stored in the listener when it is attached, so they must be known then. **Fix:** pass a literal or a program-level constant: `run show("#intro")`, or `const panel = "#intro"` and `run show(panel)`. If the value is only known at run time, let the action read it in its own body.
