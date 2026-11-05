---
code: eligius-W151
---

**Cause:** Eligius' lint of the compiled configuration: an operation reads `$operationdata.<name>` (written directly, or passed as an argument), but no operation before it in the same list provides `<name>`, so at runtime it reads nothing. **Fix:** provide the value first (pass a literal or an action parameter, or create it with an earlier operation), or read a property that the list does provide. The message gives the JSON path; the diagnostic sits at the source that produced it.
