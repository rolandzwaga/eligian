---
code: scenario-media-timeline
---

**Cause:** a scenario error: a `navigate` step names a `video` or `audio` timeline, or the program has only media timelines. Media timelines need a browser and are not played headlessly; the scenario stays on the current timeline (or does not run at all). **Fix:** drive the scenario through the non-media timelines only, and try the media timelines in the browser with `eligian dev`.
