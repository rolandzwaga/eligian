---
code: languages-missing-default
---

**Cause:** a `languages { … }` block declares more than one language but none is marked as the default. **Fix:** put `*` before exactly one entry: `languages { * "en-US" "English"  "nl-NL" "Nederlands" }`. A block with a single language needs no marker.
