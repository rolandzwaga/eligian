---
code: eligius-E130
---

**Cause:** Eligius' lint of the compiled configuration: the expression of a `when` operation does not parse; the message is the expression parser's. **Fix:** write the condition as a DSL `if (…)`, which the compiler turns into a valid expression, instead of a raw `when("…")` string. In a raw string, compare a property chain (`$operationdata.x`) with a literal using one operator, and balance the parentheses.
