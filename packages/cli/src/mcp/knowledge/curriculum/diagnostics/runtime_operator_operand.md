---
code: runtime_operator_operand
---

**Cause:** an operator has a runtime operand (a parameter, variable, system property or property chain) where Eligius cannot evaluate it: arithmetic (`x + 10`, `-x`) anywhere, or a comparison or logical operator (`x > 5`, `a && b`) outside an `if` condition. **Fix:** for arithmetic use the `calc` operation; its result is `$operationdata.calculationResult`. Move comparisons and logic into an `if (…)` condition. For string concatenation with `+`, make one operand a string: a string literal or a parameter annotated `: string`.
