---
code: scenario-unknown-timeline
---

**Cause:** a scenario error: a `{ "navigate": "<name>" }` step names a timeline the program does not declare. The message lists the declared names; the scenario stays on the current timeline. **Fix:** use the timeline's source name exactly as written in `timeline "<name>" in …`.
