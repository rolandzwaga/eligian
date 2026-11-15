---
code: eligius-W160
---

**Cause:** Eligius' lint of the compiled configuration: a `setData` key writes a field of `$scope` that the engine itself uses to run the action (`operations`, `currentIndex`, `parent`, `owner`, `eventbus`, the loop fields), so the action can misbehave. **Fix:** store your own value under `$scope.variables.<name>`, as the message suggests, or under `$operationdata.<name>` / `$globaldata.<name>`.
