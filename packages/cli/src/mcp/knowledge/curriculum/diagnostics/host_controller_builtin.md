---
code: host_controller_builtin
---

**Cause:** a `controller` declared in `extensions "./host.ts" { … }` has the name of an Eligius controller (`controller LabelController(…)`); Eligius refuses to register a built-in name. **Fix:** give the host controller another name, in the declaration and in the module's export, for example `controller Confetti(count: number)`.
