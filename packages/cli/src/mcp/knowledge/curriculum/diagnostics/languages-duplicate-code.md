---
code: languages-duplicate-code
---

**Cause:** a type-system error: the same language code appears twice in the `languages { … }` block (reported on the second one). **Fix:** remove the duplicate entry, or correct it to the language that was meant: `languages { * "en-US" "English"  "nl-NL" "Nederlands" }`.
