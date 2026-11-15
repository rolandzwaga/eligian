---
code: invalid_css_file
---

**Cause:** the `styles "./main.css"` file exists but has CSS syntax errors; the message gives the line, column and parser message of the first one. **Fix:** correct the CSS at that position (an unclosed `{`, a missing `;` or `}`, a stray character). Until it parses, its classes and ids are unknown, so the class and selector errors that follow are cascades.
