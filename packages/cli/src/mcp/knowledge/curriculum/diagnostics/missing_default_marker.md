---
code: missing_default_marker
---

**Cause:** a `languages { … }` block lists two or more languages and none is marked as the default. A single language needs no marker; several need exactly one `*`. **Fix:** put `*` before the entry of the default language: `languages { * "en-US" "English"  "nl-NL" "Nederlands" }`. Marking more than one entry is `multiple_default_markers`.
