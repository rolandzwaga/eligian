---
code: locales-import-error
---

**Cause:** the `locales "./file.json"` import cannot be used: the file is missing or unreadable, it is not valid JSON, or its shape is wrong. The message names the property (for example `Property "/en-US/greeting" must be a string`): every top-level key is a language tag from the `languages { … }` block, and every value under it is a map of label ids to strings. **Fix:** correct the path (relative to the `.eligian` file, starting with `./` or `../`), make the JSON valid, or give every label a string value under each language. While it fails, every label id is unknown, so the label errors that follow are cascades.
