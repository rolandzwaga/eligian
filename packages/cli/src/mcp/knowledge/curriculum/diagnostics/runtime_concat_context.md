---
code: runtime_concat_context
---

**Cause:** a string concatenation with a runtime value (a parameter, variable, system property or property chain, e.g. `"#" + id`) appears where the compiler cannot place the operations that build it. **Fix:** move the concatenation to a supported position: an operation argument (`selectElement("#" + id)`), an action call argument, a `with "#" + id { … }` selector, or a `const` inside an action body (`const sel = "#" + id`), and use the result there. Program-level consts, times and event names take compile-time constants only.
