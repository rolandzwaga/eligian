---
code: INVALID_PATH_FORMAT
---

**Cause:** an import path that is not a well-formed relative path string. The current validator does not emit this code: every path that does not start with `./` or `../` is reported as `ABSOLUTE_PATH`. **Fix:** as for `ABSOLUTE_PATH`: write the path as a quoted string relative to the `.eligian` file's directory, starting with `./` or `../`.
