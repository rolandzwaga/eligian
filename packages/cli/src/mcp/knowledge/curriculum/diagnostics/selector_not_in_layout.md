---
code: selector_not_in_layout
---

**Cause:** a warning: the selector names an id (or class) that the imported CSS defines but the imported layout HTML does not contain. It only matches an element that an operation creates at runtime, so as written it most likely selects nothing. **Fix:** add the element to the layout HTML, or change the selector to an id that is in the layout. If an operation (for example `createElement`) really creates the element before it is selected, the warning can stay.
