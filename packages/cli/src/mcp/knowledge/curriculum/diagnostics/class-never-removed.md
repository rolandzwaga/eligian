---
code: class-never-removed
---

**Cause:** a review warning: an `addClass` in a timeline is never undone later in that timeline: not by the same event's end block, an endable action's end block, a later event, or `on leave`. The class stays on the element after the event ends, and when the timeline is seeked or entered again. **Fix:** remove (or toggle) it where the effect should end: the event's end block (`at 0s..3s [ selectElement("#x") addClass("on") ] [ selectElement("#x") removeClass("on") ]`), an endable action, a later event, or `on leave`. If the class is meant to stay for good, the warning can be accepted.
