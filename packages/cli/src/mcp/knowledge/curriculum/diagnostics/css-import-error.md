---
code: css-import-error
---

**Cause:** an imported CSS file (`styles` or a named `.css` import) cannot be loaded: it does not exist at the path, or it cannot be read. Paths are relative to the `.eligian` file's directory. **Fix:** correct the path (it starts with `./` or `../`) or create the file. While it fails, its classes and ids are unknown, so the class and selector errors that follow are cascades.
