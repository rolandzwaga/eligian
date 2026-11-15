---
code: import-duplicate-default
---

**Cause:** a document has more than one default import of the same kind. `layout`, `styles`, `provider` and `locales` are allowed once each per document. **Fix:** keep one `styles "./main.css"` (or `layout`, …) line and remove the other. Load any further stylesheet with a named import, `import theme from "./theme.css"`: it is added to `cssFiles` after the `styles` file, and its classes and ids are validated too.
