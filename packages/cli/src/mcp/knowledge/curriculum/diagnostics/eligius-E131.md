---
code: eligius-E131
---

**Cause:** Eligius' lint of the compiled configuration: a `when` expression parses, but one operand is neither a literal nor a property chain Eligius can read (`$operationdata.…`, `$globaldata.…`, `$scope.…`); the message names it. **Fix:** write the condition as a DSL `if (…)`, which compiles its operands for you, or correct the operand: quote string literals and start property chains with `$`.
