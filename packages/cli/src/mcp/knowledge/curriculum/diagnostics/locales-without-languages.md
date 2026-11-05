---
code: locales-without-languages
---

**Cause:** the program imports `locales "./file.json"` but has no `languages { … }` block, so its labels have no declared languages. The locales file is not loaded while this error stands, so label errors that follow are cascades. **Fix:** add a languages block listing every language tag the locales file uses, one `"code" "label"` entry each, the default marked with `*` when there are two or more: `languages { * "en-US" "English"  "nl-NL" "Nederlands" }`. Or remove the `locales` import if the program uses no labels.
