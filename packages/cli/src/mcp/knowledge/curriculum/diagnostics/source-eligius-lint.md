---
source: eligius-lint
---

**Cause:** Eligius' own lint of the compiled JSON configuration found a problem the Eligian checks do not cover; the message gives the rule and the JSON path, and the diagnostic sits at the source that produced it. **Fix:** change the operation call or argument at that location; the `operation/<name>` docs describe its parameters and allowed values. These findings are the engine's authority on the compiled configuration.
