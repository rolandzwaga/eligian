---
code: too_many_parameters
---

**Cause:** `addController("<Name>", …)` passes more arguments after the controller name than that controller has parameters; the message gives the expected count. **Fix:** remove the extra arguments. The parameters are positional, in the order the `controllers` chunk lists them; a host controller's parameters are the ones its `extensions` declaration lists. Values that are not controller parameters belong in other operations.
