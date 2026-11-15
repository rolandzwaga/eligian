---
code: missing_labels_file
---

**Cause:** the file of a `locales "./file.json"` import does not exist, resolved relative to the `.eligian` file; the message gives the path as written. While it is missing, every label id is unknown, so label errors that follow are cascades. **Fix:** correct the path (relative, starting with `./` or `../`) or create the file. In the editor the quick fix *Create labels file* writes one; otherwise write it yourself: one top-level key per language tag of the `languages { … }` block, each an object of label ids to strings, e.g. `{ "en-US": { "title": "Welcome" }, "nl-NL": { "title": "Welkom" } }`.
