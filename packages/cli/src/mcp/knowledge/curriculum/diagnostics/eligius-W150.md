---
code: eligius-W150
---

**Cause:** Eligius' lint of the compiled configuration: a property chain (`$operationdata.…`, `$globaldata.…`) is passed in a property that this operation does not resolve, so the operation receives the chain as plain text. The message names the operation and the property. **Fix:** pass a literal value there, or resolve the value first with `setOperationData`, as the message suggests.
