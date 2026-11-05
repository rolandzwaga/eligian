---
code: languages-multiple-defaults
---

**Cause:** more than one entry of the `languages { … }` block is marked with `*` (reported on the second and later ones). **Fix:** keep `*` on the one default language and remove it from the others: `languages { * "en-US" "English"  "nl-NL" "Nederlands" }`.
