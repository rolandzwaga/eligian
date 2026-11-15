---
code: type-mismatch
---

**Cause:** a type-system check failed without a more specific code: a value's type does not fit where it is used, for example an argument against an annotated parameter (`action f(x: number)` called as `f("a")`), or a value against an operation parameter's type. The message names the types. **Fix:** pass a value of the expected type, or correct the annotation. Annotations are optional; `unknown` opts a parameter out of type checking.
