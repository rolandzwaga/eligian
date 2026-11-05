---
code: media-timeline-first-without-start-gesture
---

**Cause:** a review warning: the first declared timeline (the entry the engine starts with) is a `video` or `audio` timeline, and its `on enter` holds no `on click "<selector>" play` or `toggle`. Browsers block media playback that no user gesture started, so the presentation stays silent and still. **Fix:** add a start control to its `on enter`, for example `on enter [ on click "#play" toggle ]` (with a `#play` button in the layout and an `on leave` that removes its DOMEventListenerController), or declare a `raf` hub first whose Start button does `on click "#start" navigate "<media timeline>"`.
