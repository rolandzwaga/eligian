# @eligian/language — Known Issues

Compiler/language issues found while building `examples/eligian-tour/` and running
the compiled output in the real Eligius engine (jsdom). Severity: 🔴 critical ·
🟠 high · 🟡 medium · ⚪ low.

---

## ✅ C3 — FIXED — `if`/`else` produced an unparseable `when`

**Fixed 2026-06-18.** Every `if`/`else` crashed at runtime. The transformer
emitted `when` with `operationData.condition`, but the engine's `when` op reads
`operationData.expression` — a formatted string `LEFT<op>RIGHT` (no spaces) that
it parses by splitting on a single comparison operator (`== != >= <= > <`), each
side a number / single-quoted string / property chain. The old value was a
constant-folded boolean or a parenthesized, JSON-quoted string — unparseable
either way (`parseExpression(undefined)` / malformed). Found by running a compiled
chapter in the engine (jsdom); compiler tests never executed `when`.

Fix in `compiler/transformers/operation-transformer.ts`:
- serialize the condition into the engine `expression` format (`serializeWhenExpression` / `serializeWhenOperand`);
- **constant-fold** a condition that evaluates to a literal boolean → emit only
  the taken branch, no `when` (so `if (true)` and `if (@C > 0)` with constant `C`
  work, instead of emitting a bogus `when`);
- **hard compile error** for conditions `when` can't represent (logical `&&`/`||`/`!`,
  bare booleans, arithmetic operands) — the engine simply cannot evaluate them.

Regression tests: `compiler/__tests__/if-when-expression.spec.ts` (+ updated
`transformer.spec.ts` and the `transformer-golden` snapshot).

---

## ✅ C4 — FIXED — array/object const not folded → unreadable at runtime

**Fixed 2026-06-18.** The constant evaluator folded only scalars, so a literal
array/object const (`const pts = ["#a","#b"]`) became a runtime `setVariable`
plus a `$scope.variables.pts` reference. Because a `forEach`/`when` runs in a
**pushed child scope** that doesn't expose the parent's `variables` (engine
limitation — see E1 below), that reference can't resolve at runtime
(*"Property chain 'variables.pts' cannot be resolved"*). Fix: extend
`expression-evaluator.ts` to fold array/object literals whose elements are all
constant, so the literal is inlined (`forEach` gets a real array) and no runtime
variable is created. Regression tests: array/object folding in
`expression-evaluator.spec.ts`, const-array-into-`forEach` in
`action-scoped-constants.spec.ts`.

---

## ✅ E1 — FIXED & LIVE (eligius 2.2.2) — pushed scopes & parent `$scope.variables`

A `forEach`/`when` runs in a child scope created by `_pushScope`
(`eligius src/action/action.ts`), which proxies only `currentIndex`/`eventbus`/
`operations` from the parent — **not `variables`** (nor `currentItem`, etc.). So a
scope variable set with `setVariable` (e.g. a non-literal `const`, or any runtime
variable) is **unreadable** via `$scope.variables.X` inside or at a loop/conditional.
This is an **engine** issue (lives in `F:\projects\eligius\eligius`, not this repo).
C4 sidesteps it for *literal* consts by inlining them; the general case
(runtime variable used as a loop collection / in a `when`) needed an engine fix.

**Fixed in eligius** (branch `fix/scope-var-resolving`, commit `7e84c891`):
`resolveExternalPropertyChain` now resolves a `$scope` chain against the nearest
scope (current or ancestor) that declares the chain's head property, walking
`.parent` — natural lexical shadowing, write semantics unchanged.

**Now LIVE in eligian** — eligius `2.2.2` (with this fix) is installed and the
dep bumped. The tour exercises it directly: `ch3RevealBullets` does
`setVariable("points", [..])` then `for (p in $scope.variables.points)`, and the
`forEach` resolves that collection up the scope chain from inside its own child
scope. Verified end-to-end in the real engine (jsdom): the three bullets get
`in`. Note the only DSL path that produces a *working* runtime scope-var loop is
`setVariable` with a **literal** value (`const` of a literal folds via C4; a
`const` of a runtime expression stores an *unresolved* chain because `setVariable`
does not resolve its `value`).

---

## ✅ C5 — FIXED — direct `$scope` / `$operationdata` / `$globaldata` reference dropped its `$`

**Fixed 2026-06-18.** A direct property-chain reference written in the DSL
(`$scope.variables.x`, `$operationdata.x`, `$globaldata.x`) compiled to
`scope.variables.x` — **without the leading `$`**. The grammar captures the scope
name without the `$` (it's a literal token), and the general expression
transformer emitted ``${scope}.${properties}`` instead of ``$${scope}.…``.
Eligius's `resolveExternalPropertyChain` only treats a value as a chain when it
starts with `$scope.` / `$operationdata.` / `$globaldata.` (`isExternalProperty`),
so the engine took the value as a plain string literal — e.g. a `for` loop over
`$scope.variables.points` threw *"Expected resolved collection property to be
array type, string value was probably not resolved correctly"*. (The `when`
operand serializer already prepended `$` correctly — only the general
`expression-transformer.ts` path was wrong.) Found by dogfooding the runtime
scope-var loop in the tour. Fix: prepend `$` in the `PropertyChainReference` case
of `compiler/transformers/expression-transformer.ts`. Regression tests in
`compiler/__tests__/transformer.spec.ts` (property-chain assertion corrected +
a new all-three-sigils `for`-collection test).

---

## ✅ T1 — FIXED — eligius 2.2.2 / jquery@4 crashed the whole toolchain in Node

**Fixed 2026-06-18.** The `eligius` 2.2.1 → 2.2.2 upgrade pulled in **jquery@4**,
which *throws* `jQuery requires a window with a document` the instant it is
evaluated in any DOM-less Node context (jquery@3 silently tolerated it). eligius
ships a single bundle (no DOM-free entry), so importing **any value** from it in
Node evaluates jquery. The compiler reached it through one tiny value import —
`isLocaleReference` (a 4-line guard) — in three runtime files, one of which sits
under the typir type system that `createTestContext()` builds. Blast radius:
`node bin/cli.js` crashed on load, the extension host would crash, and **80 of
138 language test files** failed at import.

Fix (two parts):
- **Runtime decoupling:** inlined `isLocaleReference` into
  `@eligian/shared-utils` (`locale-guards.ts`, structurally `{ $ref: string }`,
  no eligius import) and repointed all three call sites
  (`translation-key-extractor.ts`, `locale-metadata-extractor.ts`, extension
  `key-tree-builder.ts`). eligius is now **type-only** in all runtime code
  (types are erased), so jquery is never evaluated in Node.
- **Build-time DOM shim (interim, now removed):** initially the metadata/registry
  **generators** (and their two specs) imported a `completion/eligius-dom-shim.ts`
  that installed a jsdom `window`/`document` (+ no-op canvas `getContext` for the
  bundled lottie-web) before eligius loaded.

**UPDATE — proper cure landed (eligius 2.3.0).** eligius now ships a DOM-free
`eligius/metadata` subpath export (eligius commit `aae61175`). The generators,
`metadata-converter.ts`, and the two generator specs now import from
`eligius/metadata` and the DOM shim was **deleted**. (`jsdom` + `@types/jsdom`
are consequently unused in `@eligian/language` and should be dropped from its
devDeps once pnpm's `minimumReleaseAge` policy stops blocking ops on the
freshly-published eligius@2.3.0.)

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
