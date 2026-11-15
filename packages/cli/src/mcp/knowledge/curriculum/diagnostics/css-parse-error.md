---
code: css-parse-error
---

**Cause:** an imported CSS file has a syntax error, such as an unclosed block or a broken selector; the message gives the line and column in the CSS file. **Fix:** correct the CSS at that position. Until it parses, the file's classes and ids are unknown, so the class and selector errors that follow are cascades.
