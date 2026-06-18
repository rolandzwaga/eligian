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

## 🟠 C1 — OPEN — a built-in operation argument is only wired if the param NAME matches the operation's input property

**Symptom:** inside an action, calling a built-in operation with a **bare
parameter reference** as an argument silently does nothing unless the parameter
happens to be named exactly like the operation's input property.

**Example:**
```eligian
action narrate(text: string) [
  selectElement("#narration")
  setElementContent(text)      // ❌ renders nothing
]
action narrate(template: string) [
  selectElement("#narration")
  setElementContent(template)  // ✅ works
]
```

**Why:** for a **literal** argument the compiler maps it positionally to the
operation's input property — `selectElement("#x")` → `operationData: { selector: "#x" }`.
But for a **parameter-reference** argument it emits the operation with **no
operationData for that argument**, relying on the parameter already being present in
`operationData` under a name the operation reads. That only works when the action
parameter name equals the operation property name:
- `selectElement` reads `selector` → param must be named `selector`
- `addClass` reads `className` → param must be named `className`
- `setElementContent` reads `template` → param must be named `template`

So `selectElement(selector)` works by coincidence; `setElementContent(text)`
silently fails. Inspect a compiled action: the operation appears with the input
property simply **missing**, no `$operationdata.<param>` bridge.

**Expected:** a parameter-reference argument should compile to the operation's
input property as `"$operationdata.<param>"` (bridging any name), the same way a
literal is mapped — so the argument works regardless of parameter name. This
needs the positional-arg → operation-property mapping (already used for literals)
to also apply to parameter references.

**Workaround (in use):** name action parameters to match the consuming
operation's input property (e.g. `template` for `setElementContent`). Footgunny —
a typo'd/renamed param silently produces no output with no error.

**Severity:** high — silent, no compile error, easy to hit, affects any action
that forwards a parameter to a built-in operation whose property name differs.
