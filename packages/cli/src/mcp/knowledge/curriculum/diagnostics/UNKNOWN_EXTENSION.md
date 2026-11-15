---
code: UNKNOWN_EXTENSION
---

**Cause:** a named import without an `as` clause has an extension Eligian cannot map to an asset type. It infers `.html` (html), `.css` (css) and `.mp4`, `.webm`, `.mp3`, `.wav` (media); every other extension, `.htm` included, needs an explicit type. **Fix:** add the type: `import card from "./card.tmpl" as html`; the types are `html`, `css` and `media`.
