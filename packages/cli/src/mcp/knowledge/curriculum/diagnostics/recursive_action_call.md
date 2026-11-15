---
code: recursive_action_call
---

**Cause:** an action calls itself, directly or through other actions (the message shows the chain), so it would start forever. **Fix:** remove the call that closes the loop. To repeat operations, use `for (item in items) { … }` inside the action, more timeline events, or the timeline's `loop` option.
