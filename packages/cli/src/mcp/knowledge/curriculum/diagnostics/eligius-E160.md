---
code: eligius-E160
---

**Cause:** Eligius' lint of the compiled configuration: a `setData` key does not start with `$scope`, `$operationdata` or `$globaldata`, so the engine throws "Unrecognized target". The validator normally reports this first as `invalid_setdata_target`. **Fix:** write the key as `"$operationdata.<name>"`, `"$globaldata.<name>"` or `"$scope.<name>"`; for a missing `$`, apply the quick fix of `invalid_setdata_target`.
