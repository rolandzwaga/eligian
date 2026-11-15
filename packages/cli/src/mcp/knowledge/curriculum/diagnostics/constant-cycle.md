---
code: constant-cycle
---

**Cause:** a `const` refers to itself, directly or through other constants (the message shows the chain), so it has no value. **Fix:** give one constant in the chain a value that does not depend on the others, for example a literal: `const beat = 2s` then `const bar = @beat + @beat`, not two constants defined in terms of each other.
