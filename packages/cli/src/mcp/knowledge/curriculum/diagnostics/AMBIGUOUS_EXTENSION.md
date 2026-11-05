---
code: AMBIGUOUS_EXTENSION
---

**Cause:** a named import without an `as` clause has an extension that fits more than one asset type, so its type cannot be inferred. Today that is `.ogg` (audio or video). **Fix:** state the type: `import clip from "./clip.ogg" as media`.
