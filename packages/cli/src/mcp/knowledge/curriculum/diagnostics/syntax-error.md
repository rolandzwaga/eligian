---
code: syntax-error
---

**Cause:** the text does not match the Eligian grammar; the message says what was expected and what was found. Common slips: a timeline header without `in` (`timeline "Main" in "#stage" using raf { … }`); an interaction (`on click "#b" play`) bare in a timeline body, which admits only `on enter`, `on leave` and timed events (put it inside `on enter [ … ]`); a keyword used as a name; a negative time. **Fix:** correct the first syntax error first: later errors, and other diagnostics on the same constructs, often cascade from it. `syntax-cheatsheet` shows every construct.
