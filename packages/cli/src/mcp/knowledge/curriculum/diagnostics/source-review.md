---
source: review
---

**Cause:** a review warning: the program compiles, but the compiled configuration would misbehave at runtime, for example by leaving state behind when an event ends or a timeline is left. **Fix:** apply the diagnostic's `quickFix` when present; otherwise add the matching undo step the message asks for, in an end block or in `on leave`.
