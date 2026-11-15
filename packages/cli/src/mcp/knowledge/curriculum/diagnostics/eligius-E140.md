---
code: eligius-E140
---

**Cause:** Eligius' lint of the compiled configuration: a property chain (`$operationdata.…`, `$globaldata.…`, `$scope.…`, or a `setData` key) contains the segment `__proto__`, `prototype` or `constructor`, which the engine refuses. **Fix:** rename the property so that no segment of the chain is one of those three words, at the source location the diagnostic points to.
