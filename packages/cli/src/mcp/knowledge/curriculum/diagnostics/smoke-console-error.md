---
code: smoke-console-error
---

**Cause:** a smoke error: the presentation wrote to `console.error` while it played (the engine, a controller or a host module logged an error). The message is the logged text; the problem's `timeline` and `time` say when it happened. **Fix:** find what logs it, usually an operation or controller that got data it cannot use, or a host module's own `console.error`, and fix the cause.
