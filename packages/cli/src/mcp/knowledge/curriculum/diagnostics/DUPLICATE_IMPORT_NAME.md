---
code: DUPLICATE_IMPORT_NAME
---

**Cause:** two named imports (`import name from "./file"`) use the same name; the later one is reported. Import names must be unique in a document. **Fix:** rename the later import and every reference to it, for example `import introLayout from "./intro.html"`.
