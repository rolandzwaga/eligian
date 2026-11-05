---
code: smoke-console-warn
---

**Cause:** a smoke warning: the presentation wrote to `console.warn` while it played. The message is the logged text; the problem's `timeline` and `time` say when it happened. A `selectElement` that matches nothing is not reported here: that is `smoke-selector-miss`, in strict mode. **Fix:** read the warning and fix its cause if it matters. A warning is not an error.
