---
code: smoke-step-timeout
---

**Cause:** a smoke error: one engine step (init, a seek, a timeline switch, a scenario step) did not finish within the step timeout (10 s by default). The message names the step. Usually an operation waits for something that never comes in the headless run: a long `wait`, or a promise a host operation never settles. **Fix:** find the operation that blocks in that step and fix it; if the step really is that slow, raise `--step-timeout-ms` (CLI) or `stepTimeoutMs` (`eligian_smoke`).
