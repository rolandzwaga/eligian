---
code: no_labels_import
---

**Cause:** a translation key is used (the label argument of `addController("LabelController", "<id>")`, or an operation parameter of type label id) but the document has no translation keys at all: there is no `locales "./file.json"` import, or the imported file failed to load or holds no labels. **Fix:** add `locales "./locales.json"` and a `languages { … }` block, and put the key in the file under every language: `{ "en-US": { "hub": { "title": "Tour" } } }` gives the key `hub.title`. If an import exists, fix its own error first (`missing_labels_file`, `locales-parse-failed`, `locales-import-error`).
