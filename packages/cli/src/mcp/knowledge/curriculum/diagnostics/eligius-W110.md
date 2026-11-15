---
code: eligius-W110
---

**Cause:** Eligius' lint of the compiled configuration: an operation depends on a property that an earlier operation must provide (most often `selectedElement`), and no operation before it in the same list provides it. The message lists operations that do. **Fix:** put a provider first: `selectElement("<sel>")` before the call, a `with "<sel>" { … }` block, or `target "<sel>"` on the event. In an action, select inside the action, passing the selector as a parameter.
