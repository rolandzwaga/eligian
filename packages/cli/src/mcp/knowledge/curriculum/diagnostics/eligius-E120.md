---
code: eligius-E120
---

**Cause:** Eligius' lint of the compiled configuration: an operation property only accepts a fixed set of values, and the literal argument is not one of them (the message lists the allowed values and gives the JSON path). **Fix:** pass one of the listed values at the reported source location; the `operation/<name>` docs list the allowed values of each parameter.
