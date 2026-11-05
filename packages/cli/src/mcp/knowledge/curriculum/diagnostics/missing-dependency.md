---
code: missing-dependency
---

**Cause:** an operation needs a property that no earlier operation in the same list provides. Most often `selectedElement`: `addClass`, `removeClass`, `setStyle` and friends act on the selected element. An event's end block starts without the start block's selection. **Fix:** provide the property first: `selectElement("#x")` before the operation, `with "#x" { … }` around it, or `target "#x"` on the event (it selects at the head of the start and end blocks). The message names an operation that provides it. Apply the diagnostic's `quickFix` when it has one; `dataflow-tables` lists what each operation needs and provides.
