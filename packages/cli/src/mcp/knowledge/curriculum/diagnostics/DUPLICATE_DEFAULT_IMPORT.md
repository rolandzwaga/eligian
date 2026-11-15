---
code: DUPLICATE_DEFAULT_IMPORT
---

**Cause:** a document has more than one default import of the same kind; `layout`, `styles`, `provider` and `locales` are allowed once each. `eligian check` and the editor report this problem as `import-duplicate-default`. **Fix:** keep one line of each kind and remove the others. Load a further stylesheet with a named import, `import theme from "./theme.css"`.
