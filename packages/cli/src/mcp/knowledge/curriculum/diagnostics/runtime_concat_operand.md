---
code: runtime_concat_operand
---

**Cause:** an object or array literal, or a constant whose value is one, is an operand of a string concatenation with a runtime value, e.g. `"items: " + [1, 2] + name`. Only strings, numbers and runtime values can be joined. **Fix:** take the object or array out of the concatenation: join the string or number you actually need (a literal, a constant string, a property chain to the field), or pass the object or array as an argument of its own.
