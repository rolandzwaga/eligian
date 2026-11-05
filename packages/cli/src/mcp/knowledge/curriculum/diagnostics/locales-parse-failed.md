---
code: locales-parse-failed
---

**Cause:** a warning on a `locales "./file.json"` import: the file exists but reading it failed, most often because it is not valid JSON (a trailing comma, a missing quote). The message carries the parser's own error. Until it parses, no label id of the file is known, so the label errors that follow are cascades. **Fix:** make the file valid JSON in the locales shape: one top-level key per language tag of the `languages { … }` block, each holding (nested) objects of label ids to strings, e.g. `{ "en-US": { "hub": { "title": "Tour" } } }`. A wrong shape in valid JSON is `locales-import-error`.
