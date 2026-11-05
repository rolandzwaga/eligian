---
code: stagger-delay-not-positive
---

**Cause:** the delay of a `stagger` block (the time after `stagger`) is zero or less, so the items would not be spread out. **Fix:** use a positive delay between consecutive items: `stagger 200ms [".a", ".b", ".c"] with fadeIn() for 2s`. To start every item at the same time, write one event that handles them all instead of a `stagger`.
