---
code: missing_dependency
---

**Cause:** the legacy underscore spelling of an operation dependency error (`MISSING_DEPENDENCY` lowercased). It stays in the code registry, but no current validator emits it: an operation that needs a property no earlier operation provides is reported as `missing-dependency` (hyphen). **Fix:** treat it as `missing-dependency`: provide the property first, most often the selected element, with `selectElement("#x")` before the operation, `with "#x" { … }` around it, or `target "#x"` on the event. Apply the diagnostic's `quickFix` when it has one; `dataflow-tables` lists what each operation needs and provides.
