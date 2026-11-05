---
code: event-duration-not-positive
---

**Cause:** an `at <start> for <duration>` event has a duration of zero or less (`at 2s for 0s`, or a constant expression that resolves to a negative length). **Fix:** give a positive duration, `at 2s for 3s`; with constants, check the value the expression resolves to. A moment-like effect still needs a short positive range.
