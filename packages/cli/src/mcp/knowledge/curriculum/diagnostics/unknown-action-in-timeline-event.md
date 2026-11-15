---
code: unknown-action-in-timeline-event
---

**Cause:** a timed event calls a name that is neither a defined nor an imported action (`at 0s..3s showIntro()`). A timed event calls an action, or holds an inline `[ … ]` block of operations. **Fix:** define the action (`action showIntro() [ … ]`), import it from a library (`import { showIntro } from "./lib.eligian"`), or correct the spelling.
