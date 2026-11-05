---
code: duplicate_host_parameter
---

**Cause:** a host `operation` or `controller` declaration in the `extensions` block lists the same parameter name twice, as in `operation trackEvent(name: string, name: string)`. **Fix:** give each parameter its own name, matching the properties the host code reads from its operation data (or the controller from its data). Delete the repeated one if it was a mistake.
