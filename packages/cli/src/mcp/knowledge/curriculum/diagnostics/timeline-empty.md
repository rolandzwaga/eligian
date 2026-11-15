---
code: timeline-empty
---

**Cause:** a warning: a timeline block has no events and no `on enter` / `on leave` block, so it does nothing. Often a cascade of a syntax error inside or before the block. **Fix:** fix any syntax error first; otherwise add at least one event (`at 0s..3s showTitle()`) or a lifecycle block, or remove the timeline.
