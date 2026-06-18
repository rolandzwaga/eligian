# @eligian/language — Known Issues

Compiler/language issues found while building `examples/eligian-tour/` and running
the compiled output in the real Eligius engine (jsdom). Severity: 🔴 critical ·
🟠 high · 🟡 medium · ⚪ low.

---

## ✅ C2 — FIXED — zero-arg action call crashed the engine

**Fixed 2026-06-18.** A custom-action call with **no arguments** (e.g.
`clearSpots()`) compiled its `startAction`/`endAction` with `operationData: {}` —
omitting `actionOperationData`. At runtime the engine does
`mergeOperationData(...)` / `Object.keys(actionOperationData)` on that field, so it
threw `TypeError: Cannot convert undefined or null to object` the moment a zero-arg
action fired. Fix in `compiler/transformers/action-call-operations.ts`: always emit
`operationData: { actionOperationData: actionOperationData ?? {} }`. Regression
tests: `compiler/transformers/__tests__/action-call-operations.spec.ts` (and the
updated `transformer.spec.ts` / `transformer-golden` snapshots).

Found by running a compiled chapter in the engine — the compiler/typechecker
cannot catch it because it's a runtime contract of the `startAction`/`endAction`
operations (eligius `src/operation/start-action.ts`, `end-action.ts`).

---

## ✅ C1 — NOT A BUG (by design): action params feed operations BY NAME

**Retracted (2026-06-18) — I wrongly flagged this as a bug.** It's the intended
parameter-passing contract.

An action's parameters arrive as the action's `operationData` keyed by the
**parameter name** (`startAction` merges `actionOperationData` keyed by name).
Operations read their inputs by property name off `operationData`. Eligius only
resolves params by name — there is no positional identity at runtime. Therefore an
action parameter that feeds a built-in operation **must be named to match that
operation's input property**:
- `selectElement` reads `selector`  → param named `selector`
- `addClass` reads `className`       → param named `className`
- `setElementContent` reads `template` → param named `template`

This is also why a compiler "bridge" (emitting `template: "$operationdata.text"`)
would **not** work: most operations don't resolve `$…` chains on their value
fields — `setElementContent`/`addClass` use the value directly (see eligius
`set-element-content.ts`, `add-class.ts`), so a bridged chain would render the
literal string. Only operations that explicitly call `resolveExternalPropertyChain`
(e.g. `selectElement` on `selector`) accept a `$…` value.

So `narrate(text)` failing and `narrate(template)` working is correct behaviour,
not a defect. **Convention: name action parameters after the operation property
they feed.** (Documented in `examples/eligian-tour/presentation.eligian` and
`ELIGIUS_EXECUTION_MODEL.md`.)

**Possible future ergonomics (enhancement, not a bug):** the validator *could*
warn when an action forwards a parameter to an operation whose required input
property won't be satisfied — turning today's silent no-op into a compile-time
hint. Optional.
