---
code: import_file_not_found
---

**Cause:** an import points at a file that does not exist: a library import `import { a } from "./lib.eligian"` (`Library file not found`), or, in `eligian_project`, a named asset import such as `import intro from "./intro.html"` (`Asset file not found`). Paths are relative to the importing `.eligian` file. **Fix:** correct the path (starting with `./` or `../`, with the extension) or create the file. Until it resolves, the imported names are unknown, so their errors are cascades.
