---
code: host_operation_builtin
---

**Cause:** an `operation` declared in `extensions "./host.ts" { … }` has the name of an Eligius operation (`operation addClass(…)`); Eligius refuses to register a built-in name. **Fix:** give the host operation another name, in the declaration, the module's export and every call, for example `operation trackEvent(eventName: string)`.
