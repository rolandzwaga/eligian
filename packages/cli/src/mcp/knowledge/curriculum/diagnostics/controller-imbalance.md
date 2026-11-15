---
code: controller-imbalance
---

**Cause:** a review warning: a timeline's `on enter` adds controllers that its `on leave` does not remove (or `on leave` removes ones that `on enter` did not add). Interactions (`on click …`, `on key …`) add a DOMEventListenerController or KeyboardController too. The engine never detaches controllers on a timeline switch, so they pile up: each re-entry attaches another one. **Fix:** in `on leave`, for each one: `selectElement("<selector>")` then `removeControllerFromElement("<Controller>")`. The diagnostic's `quickFix` inserts exactly these lines (or a whole `on leave` block); apply it.
