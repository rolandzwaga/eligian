---
code: media-from-duplicate
---

**Cause:** a review warning: two or more `video` / `audio` timelines name the same `from` file. It is reported on the second and later ones. A compiled media timeline is identified by its file path (its `uri`), not by its name, so the timelines that share a file cannot be told apart at runtime. **Fix:** keep one timeline per media file and put the events of the others into it (use labels or time constants to keep the sections apart), or give each timeline its own file.
