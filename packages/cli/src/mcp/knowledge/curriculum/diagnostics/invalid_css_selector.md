---
code: invalid_css_selector
---

**Cause:** a selector string (of `selectElement`, `with`, `target`, an `on click "<sel>"` interaction, an action parameter used as a selector, …) is not valid CSS selector syntax; the message gives the parser error. **Fix:** write a valid selector, such as `"#id"`, `".class"` or `"#list > li"`, with brackets and quotes balanced. A class-name argument (`addClass("on")`) takes a bare name, not a selector.
