---
code: end_block_runtime_const
---

**Cause:** the end block of an endable action, inline event, sequence item or stagger block uses a `const` of its start block whose value depends on a runtime value (a parameter, a property chain). Such a const is a variable of the start operations, and Eligius runs the end operations without it; only compile-time constants of the start block reach the end block. **Fix:** declare the const again in the end block from the same expression, or pass the value another way (a parameter, `$operationdata`).
