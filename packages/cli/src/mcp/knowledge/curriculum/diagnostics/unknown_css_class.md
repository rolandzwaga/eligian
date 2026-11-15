---
code: unknown_css_class
---

**Cause:** a class-name argument (of `addClass`, `removeClass`, `toggleClass`, or an action parameter passed on to them) names a class that no imported CSS file defines. Class names are checked against the CSS only, not the layout HTML. **Fix:** use one of the `suggestions` if it is a typo, or add the class to the imported CSS (the `styles` file or a named CSS import). Pass the bare name, without a leading dot.
