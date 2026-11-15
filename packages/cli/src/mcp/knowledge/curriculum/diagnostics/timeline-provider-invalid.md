---
code: timeline-provider-invalid
---

**Cause:** the word after `using` is not a timeline provider. The parser reports the same spot as a `syntax-error`, which is the one to fix. **Fix:** use `raf` (a plain clock: the usual choice), `video` or `audio` (with `from "<media file>"`), or `scroll` (with a `duration`): `timeline "Main" in "#stage" using raf { … }`. `custom` is accepted but there is no recipe for supplying its provider; avoid it.
