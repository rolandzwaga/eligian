---
code: duplicate_lifecycle_block
---

**Cause:** a timeline has more than one `on enter [ … ]` block, or more than one `on leave [ … ]` block; a timeline has at most one of each. **Fix:** merge the operations of the later block into the first one and delete it, as the message says. The compiler refuses the program with the same message.
