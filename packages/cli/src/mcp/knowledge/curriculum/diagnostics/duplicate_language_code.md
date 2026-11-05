---
code: duplicate_language_code
---

**Cause:** the `languages { … }` block declares the same language code twice (the message names it). **Fix:** keep one entry per code and delete the other. A second language needs a code of its own, such as `"nl-NL"`, and its own translations in the `locales` file.
