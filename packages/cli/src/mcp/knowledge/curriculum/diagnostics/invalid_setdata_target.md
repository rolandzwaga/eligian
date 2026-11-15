---
code: invalid_setdata_target
---

**Cause:** a key of the `setData({ … })` object does not name a target Eligius accepts, so Eligius would throw "Unrecognized target" at runtime. A key must be `$operationdata.<path>`, `$globaldata.<path>` or `$scope.<path>`. **Fix:** when only the `$` is missing, the quick fix adds it (`data.fixedKey`): `"operationdata.name"` becomes `"$operationdata.name"`. Otherwise rewrite the key with one of those three targets.
