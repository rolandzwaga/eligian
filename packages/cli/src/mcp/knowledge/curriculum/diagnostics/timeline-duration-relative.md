---
code: timeline-duration-relative
---

**Cause:** the timeline header's `duration` is a relative time (`duration +5s`). A duration is a length, not a point after a previous event, so `+` has no meaning there. **Fix:** write an absolute time: `duration 5s`, or a time constant (`duration @total`). To make the timeline end with its content, remove the option (not possible for `scroll` timelines).
