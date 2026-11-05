---
code: unknown_label_id
---

**Cause:** a translation key argument (of `LabelController` or a label-ID parameter) is not a key of the imported `locales` file. **Fix:** use the key the hint suggests (`Did you mean: …`), or add the key to the locales file with a text for every language. In the editor, the quick fix *Create label entry* adds it with an entry per language of the `languages` block. Without any `locales` import the code is `no_labels_import` instead.
