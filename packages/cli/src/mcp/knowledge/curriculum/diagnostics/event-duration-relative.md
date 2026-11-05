---
code: event-duration-relative
---

**Cause:** the duration after `for` is a relative time: `at 2s for +2s`. A `+` time is an offset from the previous event, not a length. **Fix:** write the length without the sign, `at 2s for 2s`; relative times belong in the start (`at +0s for 3s`).
