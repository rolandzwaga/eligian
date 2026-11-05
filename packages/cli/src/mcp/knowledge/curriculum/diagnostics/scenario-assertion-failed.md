---
code: scenario-assertion-failed
---

**Cause:** a scenario error: an assertion did not hold on the snapshot of the step its `after` names. Each failing field (`hasClass`, `notHasClass`, `text`, `visible`, `controllers`, `timeline`, `position`) is one problem, with `expected` and `actual`. **Fix:** compare `expected` with `actual` and that step's snapshot: either the program does not do what the scenario expects (fix the program), or the assertion names the wrong step or element (fix the scenario).
