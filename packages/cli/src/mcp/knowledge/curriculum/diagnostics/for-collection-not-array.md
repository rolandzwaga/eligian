---
code: for-collection-not-array
---

**Cause:** the collection of `for (item in <collection>)` has a static type that is not an array, for example a string or a number literal. **Fix:** loop over an array: an array literal (`for (n in [1, 2, 3])`), a parameter annotated `array`, or a runtime value such as `$operationdata.items`. Values whose type is unknown are not checked.
