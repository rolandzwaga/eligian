---
code: invalid_language_code_format
---

**Cause:** a code in the `languages { … }` block does not have the format `xx-XX`: 2–3 lowercase letters, a hyphen, 2–3 uppercase letters (`"en"`, `"en_US"` and `"EN-us"` fail). **Fix:** write the full code with the right case: `languages { * "en-US" "English"  "nl-NL" "Nederlands" }`. The `locales` file uses the same codes as its top-level keys.
