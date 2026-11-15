---
code: host-operation-returned-non-object
---

**Cause:** a smoke error: a host operation (declared in an `extensions` block) returned something other than an object. The engine hands each operation's return value to the next one as its operation data, so the next operation gets an empty one, and the selected element and every other property are lost. It is located at the operation's call. **Fix:** end the host operation with `return operationData;` (the object it received, changed or not), on every path.
