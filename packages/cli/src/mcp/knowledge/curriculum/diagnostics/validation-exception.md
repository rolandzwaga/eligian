---
code: validation-exception
---

**Cause:** a validation check threw an exception instead of reporting a problem (message "An error occurred during validation: …"). This is a fault in Eligian's validator, usually set off by incomplete or unusual code; the checks that would have run on that node are missing. **Fix:** fix any `syntax-error` or other errors near the spot first, then check again. If it persists on valid-looking code, rewrite the construct in a plainer form and report the message as an Eligian bug.
