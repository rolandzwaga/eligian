---
code: runtime_negation_outside_condition
---

**Cause:** `!` is applied to a runtime value (a parameter, variable, system property or property chain) outside an `if` condition, e.g. `const hidden = !visible` in an action body. Eligius evaluates negation of runtime values only inside `when` conditions, which `if` compiles to. **Fix:** move the logic into a condition: `if (!visible) { … } else { … }`, each branch passing a literal `true` or `false`. Negating a constant (`!true`, a `const`) folds at compile time and is fine.
