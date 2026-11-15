---
code: unknown_css_class_in_selector
---

**Cause:** a selector (of `selectElement`, `with`, `target`, an action parameter used as a selector, …) contains a `.class` that neither the imported CSS nor the layout HTML defines, so it matches nothing. **Fix:** use one of the `suggestions` if it is a typo; otherwise add the class to the layout HTML element it should match, or define it in the imported CSS.
