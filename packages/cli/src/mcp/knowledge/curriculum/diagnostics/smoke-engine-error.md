---
code: smoke-engine-error
---

**Cause:** a smoke error: the Eligius engine reported an error while the timelines were played (an operation or a controller failed). It is located at the failing operation when the engine names it; otherwise at the first operation that matches the reported name, with the other candidates listed in the message. **Fix:** read the message and the operation at the location: usually a missing `selectElement` before an element operation, an operation-data property that an earlier operation erased, or a wrong argument. Run `eligian check` first: it reports many of these statically.
