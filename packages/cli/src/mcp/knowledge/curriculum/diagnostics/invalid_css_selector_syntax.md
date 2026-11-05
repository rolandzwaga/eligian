---
code: invalid_css_selector_syntax
---

**Cause:** the container selector of a timeline (`timeline "main" in "<sel>" …`), or the scroll container selector of a `using scroll` timeline, is empty or not valid CSS selector syntax. **Fix:** give a valid, non-empty selector of an element in the layout HTML, usually an id: `timeline "main" in "#stage" using raf { … }`.
