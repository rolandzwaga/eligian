---
code: multiple_default_markers
---

**Cause:** more than one entry of a `languages { … }` block carries the `*` default marker; a program has exactly one default language. **Fix:** keep `*` on the default language only and remove it from the others: `languages { * "en-US" "English"  "nl-NL" "Nederlands" }`. Two or more languages with no marker at all is `missing_default_marker`.
