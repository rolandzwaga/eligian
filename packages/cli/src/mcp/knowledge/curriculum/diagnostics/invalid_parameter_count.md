---
code: invalid_parameter_count
---

**Cause:** an action is called with a different number of arguments than it declares; the message lists the expected parameter names. In a `stagger`'s action-call form the first parameter is filled with the current item, so it is not written at the call. **Fix:** pass exactly the listed arguments, in order, or change the action's parameter list. For an operation the code is `parameter_count`.
