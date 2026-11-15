---
code: if-condition-not-boolean
---

**Cause:** a type-system warning: the condition of an `if` has a static type other than boolean (a string or number literal, or a constant holding one), so it does not test anything meaningful. **Fix:** write a comparison or a boolean value: `if (count > 3) { … }`, or `if (@visible) { … }` with `const visible = true`. Runtime values (action parameters, `@@` system properties) and `unknown`-typed values are not checked.
