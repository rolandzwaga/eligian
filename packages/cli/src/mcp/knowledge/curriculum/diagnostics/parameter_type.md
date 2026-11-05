---
code: parameter_type
---

**Cause:** a literal argument of an operation call has a type its parameter does not accept, e.g. a number where a selector string is expected, or a string where an object is expected. The message names the parameter, the expected type and the type given. Runtime values (parameters, variables, `$operationdata` chains, expressions) are not checked here. **Fix:** pass a value of the expected type at that position; arguments are positional, so a value in the wrong slot needs reordering. `eligian_operations` and the `operation/<name>` docs list each parameter's type.
