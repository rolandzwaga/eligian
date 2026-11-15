---
code: timeline-source-unused
---

**Cause:** a warning: `from "…"` is given on a timeline whose provider (`raf`, `scroll`, `custom`) does not play a media file, so it is ignored. **Fix:** remove the `from "…"` clause, or switch the provider to `video` or `audio` if the timeline should follow that media file.
