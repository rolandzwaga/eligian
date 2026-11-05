---
code: smoke-timeout
---

**Cause:** an `eligian_smoke` error: the whole run took longer than `timeoutMs` (45000 ms by default), so the tool stopped it. The result holds what was played before. **Fix:** smoke fewer files or timelines per call (`timelines`), shorten long `wait` steps in the scenario, or raise `timeoutMs`. A single slow step is `smoke-step-timeout`; fix that first.
