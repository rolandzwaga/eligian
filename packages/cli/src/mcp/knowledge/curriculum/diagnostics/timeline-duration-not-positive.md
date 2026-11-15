---
code: timeline-duration-not-positive
---

**Cause:** the timeline header's `duration` is zero or less (`using raf duration 0s`). **Fix:** give a positive duration (`duration 30s`), or remove the option: without it the timeline lasts until the end of its last event. A `scroll` timeline cannot drop it, because its scroll range maps onto the duration. With a constant (`duration @total`), check the value it resolves to.
