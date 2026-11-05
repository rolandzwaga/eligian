---
code: unknown_controller
---

**Cause:** the first argument of `addController` names neither an Eligius controller nor a `controller` declared in this program's `extensions` block. Names are case-sensitive. **Fix:** use a name from the `controllers` chunk (`LabelController`, `ProgressbarController`, `NavigationController`, …), spelled exactly. For an app-specific controller, declare it: `extensions "./host.ts" { controller Confetti(count: number) }`.
