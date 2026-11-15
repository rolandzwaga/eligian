---
code: duplicate_extensions_import
---

**Cause:** the program has more than one `extensions "<path>" { … }` import; only the first one counts, every later one is reported. **Fix:** move the `operation`, `controller` and `function` declarations of the later imports into the first one and delete the rest. A program takes its host code from one module: export everything from that file (it may re-export from others).
