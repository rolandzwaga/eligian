---
code: timeline-scroll-duration-required
---

**Cause:** a `using scroll` timeline has no `duration` option. The scroll range of the container maps onto the duration, so the compiler needs one. **Fix:** add it after the other header options: `timeline "Story" in "#stage" using scroll "#scroller" duration 120s { … }`. Choose it to match the event times: events that end after the duration are never reached (`event-ends-after-timeline`).
