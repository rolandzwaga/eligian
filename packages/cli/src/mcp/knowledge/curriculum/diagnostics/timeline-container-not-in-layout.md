---
code: timeline-container-not-in-layout
---

**Cause:** a review warning: the program imports a layout, and a class or id of a timeline's `in "<selector>"` is not in that layout HTML (the message lists the missing `#id` / `.class`). The container must exist when the engine renders the layout, whatever the `selectorNotInLayout` setting is. Where `selector_not_in_layout` already reports the same range, only that one is shown. Without a layout import nothing is reported: the engine generates the containers. **Fix:** add an element with that id or class to the layout HTML, or change the timeline's `in` selector to an element the layout has.
