---
code: invalid_time_constant
---

**Cause:** an `@name` in a time (`at`, `for`, `sequence`, `stagger`, `duration`) does not evaluate to a time: its constant holds something other than a time (`7s`), a number (seconds) or arithmetic on them, it refers to itself through other constants, or it divides by zero. **Fix:** declare a program-level time constant, `const beat = 7s`, built from times, numbers and `+ - * /`, and use `@beat` only in times.
