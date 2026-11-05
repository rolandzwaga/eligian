---
code: circular_library_import
---

**Cause:** library files import each other in a cycle (the message shows the chain, for example `a.eligian → b.eligian → a.eligian`). **Fix:** break the cycle: remove one of the imports, or move the actions both libraries need into a third library that both import and that imports neither of them.
