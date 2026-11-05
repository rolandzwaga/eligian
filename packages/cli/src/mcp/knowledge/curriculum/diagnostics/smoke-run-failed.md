---
code: smoke-run-failed
---

**Cause:** a smoke error: the run itself threw, outside the engine's error reporting: for example while the engine was created or initialised, while the host module was loaded, or while a scenario's CSS files were read. The message is the exception's text; the run stops there. **Fix:** read the message and fix what it names (a broken host module, a configuration the engine refuses, a missing CSS file). Run `eligian check` first.
