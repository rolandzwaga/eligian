---
code: ABSOLUTE_PATH
---

**Cause:** an import path does not start with `./` or `../`: an absolute path (`/assets/x.html`, `C:\x.css`) or a URL. Eligian checks the path of every `layout`, `styles`, `provider`, `locales` and `import name from` statement, because absolute paths are not portable. **Fix:** write the path relative to the `.eligian` file's directory: `layout "./layout.html"`, `import theme from "../shared/theme.css"`. A file that lives outside the project is copied into it first.
