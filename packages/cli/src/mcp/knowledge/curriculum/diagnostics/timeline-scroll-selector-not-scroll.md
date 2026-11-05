---
code: timeline-scroll-selector-not-scroll
---

**Cause:** a selector string follows the provider of a timeline that is not `scroll` (`using raf "#scroller"`). Only scroll timelines take a scroll container selector. **Fix:** remove the string, or change the provider to `scroll` if the scroll position should drive this timeline (it then also needs a `duration`): `using scroll "#scroller" duration 60s`. A media file goes after `from`: `using video from "./intro.mp4"`.
