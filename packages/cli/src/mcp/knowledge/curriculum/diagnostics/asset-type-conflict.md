---
code: asset-type-conflict
---

**Cause:** a warning: a named import's `as` type differs from the type its extension implies, for example `import intro from "./intro.mp4" as html` (`.mp4` is media). **Fix:** correct the `as` type or remove the clause; `as` is needed only for extensions Eligian cannot infer (`.ogg`, `.tmpl`, …).
