---
code: invalid_controller_name_type
---

**Cause:** the first argument of `addController` is not a string literal (a parameter, constant reference or expression), so the controller cannot be resolved at compile time. **Fix:** write the controller name as a literal: `addController("DOMEventListenerController", "click", ["ping"])`. The remaining arguments are the controller's parameters, in the order of the `addController` docs.
