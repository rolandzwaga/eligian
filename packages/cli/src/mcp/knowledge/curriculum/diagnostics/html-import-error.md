---
code: html-import-error
---

**Cause:** an imported HTML file (`layout` or a named `.html` import) cannot be used: it does not exist at the path, it cannot be read, it is empty, or it contains no HTML tags or does not parse. Paths are relative to the `.eligian` file's directory. **Fix:** correct the path (it starts with `./` or `../`) or create the file, and give it real markup (UTF-8). While it fails, its ids and classes are unknown, so the selector and container errors that follow are cascades.
