---
code: erased-property-access
---

**Cause:** an operation reads a property (often `selectedElement`) that an earlier operation in the same list erased: the message names the eraser (for example `clearOperationData`). After it, the property is gone. **Fix:** restore the property after the erasing operation (`selectElement("<selector>")` again), move the reading operation before it, or remove the erasing operation if it is not needed. The `operation/<name>` docs of the eraser say what it erases; `dataflow-tables` lists every operation's needs, outputs and erasures.
