---
code: media-import-error
---

**Cause:** a media asset import cannot be used: the file of a `provider "./x.mp4"` import, or of a named import whose type is media (`import intro from "./intro.mp4"`, `as media`, or an extension that infers no other type), is missing, is a directory, or the path is empty. The message gives the path it looked for. **Fix:** put the file at that path or correct the string (relative to the `.eligian` file, starting with `./` or `../`). A named import of an HTML or CSS file with an unusual extension needs `as html` or `as css`. The `from` file of a `video` / `audio` timeline is checked by review instead (`media-file-missing`).
