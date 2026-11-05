---
code: scenario-selector-not-found
---

**Cause:** a scenario error: a `click` or `key … in` step names a selector that matches no element at that moment, or an assertion's `selector` is not an id of the layout (assertions address layout ids, `#id`). The problem carries the step index. **Fix:** use a selector that exists when the step runs (check the previous step's snapshot), and address assertions by a layout `#id`.
