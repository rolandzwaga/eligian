---
code: media-file-missing
---

**Cause:** a review warning: the `from` file of a `video` or `audio` timeline does not exist, resolved relative to the `.eligian` file. The message gives the absolute path it looked for. The `video` starter reports it on purpose for `./media/intro.mp4` until a real file is put there. The engine cannot play a media timeline without its file. **Fix:** put the media file at that path, or correct the `from` string (relative, starting with `./` or `../`). Named asset imports (`import x from "./file"`) are checked by the validator instead (`import_file_not_found`).
