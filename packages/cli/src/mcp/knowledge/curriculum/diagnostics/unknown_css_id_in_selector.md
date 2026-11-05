---
code: unknown_css_id_in_selector
---

**Cause:** a selector contains a `#id` that neither the imported layout HTML nor the imported CSS defines, so it matches nothing. **Fix:** use one of the `suggestions` if it is a typo; otherwise add an element with that id to the layout HTML, or use an id that is there. A program without a `layout` import can only use the ids its CSS defines.
