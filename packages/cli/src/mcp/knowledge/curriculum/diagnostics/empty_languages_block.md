---
code: empty_languages_block
---

**Cause:** a `languages { }` block declares no language. **Fix:** add at least one entry, `"<code>" "<label>"` with a code of the form `xx-XX`, as in `languages { * "en-US" "English" }`; with several entries, mark the default with `*`. If the presentation has one language and no `locales` file, delete the block instead.
