---
code: missing_required_parameter
---

**Cause:** an `addController("<Name>", …)` call passes fewer arguments after the controller name than that controller requires; the message names the first missing parameter and the controller. **Fix:** add the missing arguments, in order, after the name, e.g. `addController("LabelController", "hub.title")`. The parameters are positional, in the order the `controllers` chunk lists them; a host controller's parameters are the ones its `extensions` declaration lists. Passing more than it accepts is `too_many_parameters`.
