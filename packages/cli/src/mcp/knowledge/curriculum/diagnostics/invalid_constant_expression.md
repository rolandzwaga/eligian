---
code: invalid_constant_expression
---

**Cause:** an expression made only of constants has no valid value: division or remainder by zero (`10 % 0`), arithmetic on a string or boolean (`"abc" - 1`, `true + 1`), or a non-finite result. The message gives the reason; the compiler rejects it the same way. **Fix:** correct the operands or the operator: numbers on both sides of arithmetic, `+` for string concatenation, a non-zero divisor.
