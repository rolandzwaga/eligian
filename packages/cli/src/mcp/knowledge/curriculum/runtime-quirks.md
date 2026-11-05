---
id: runtime-quirks
title: "Runtime quirks: loops, conditions, the bag"
kind: runtime
use_cases:
  - "@@loopLength"
  - "if condition"
  - "host operation return value"
  - "controller operationData"
see:
  - "map-control-flow-and-data"
  - "host-modules-contract"
  - "map-controllers"
card: "Tested: @@loopLength is length−1; 'false'/'0' are true; == on a missing key is false; ! binds first; bags are shared."
---

# Runtime quirks: loops, conditions and the operationData bag

These are the places where the engine does something a reader of the Eligian source does not expect. They come from the quirks suite of eligius itself (`src/test/differential/quirks.spec.ts` in the eligius repository), and each is run again here, through the Eligian compiler, on the installed eligius. (probed: "@@loopLength is the length of the collection minus one") Each marker in parentheses names the test in `mcp-runtime-claims.spec.ts` that runs its sentence, so an eligius upgrade that changes the behaviour fails that test before this text goes stale.

## Loops

- `@@loopLength` is not the length of the collection: inside `for (item in ["x", "y", "z"])` it is `2` on every iteration, the index of the last item. For a count, add one; for a "last item" test, compare the index with `@@loopLength` itself. (probed: "@@loopLength is the length of the collection minus one")

Compiler: `@@loopLength` compiles to the property chain `$scope.loopLength`, `@@loopIndex` to `$scope.loopIndex` and `@@currentItem` (or the loop variable by name) to `$scope.currentItem`; the compiler passes them on and the engine resolves them.

## Conditions

Compiler: `if (…) { … } else { … }` compiles to `when` / `otherwise` / `endWhen` with the condition as an expression string (`"$operationdata.a == $operationdata.b"`). A condition the compiler can compute is folded into `"true"` or `"false"`, by the same rules as below, and a non-boolean condition gets a type warning.

- A bare value is true unless JavaScript calls it falsy, so the strings `"false"` and `"0"` are true, while the number `0` and the boolean `false` are not. An `if (v)` over a parameter that arrives as the text `"false"` takes the `if` branch, so pass a real boolean or number. (probed: "a when condition treats the strings 'false' and '0' as true")
- `==` against a property chain that does not resolve is strict: with no `missing` key in the operationData, `$operationdata.missing == null` is false and the `else` branch runs. Test a key you set yourself, with a default set first (`setOperationData({ shown: false })`), not the absence of one. (probed: "an == comparison against a property chain that does not resolve is strict, so it is false even against null")
- `!` binds tighter than `==`: `!a == b` is `(!a) == b`, so with `a = 0` it reads `true == b`, and `!(a == b)` is a different test. The compiler emits parentheses only when the source has them around the comparison; write them whenever the negation is meant for the whole comparison. (probed: "! binds tighter than ==, so !a == b compares (!a) with b")

## The operationData bag

- Every operation hands its return value to the next one as its operationData. An operation that returns `undefined` therefore hands the next one an empty bag: after `selectElement("#a")` and such an operation, `selectedElement` is gone, and an `addClass` that follows has no element to act on. A host operation must end with `return operationData;` on every path; `eligian smoke` reports one that does not as `host-operation-returned-non-object`. (probed: "an operation that returns undefined hands the next operation an empty operationData")
- `addController` hands the controller the block's own operationData object, not a copy. A controller that keeps it (the ProgressbarController, the NavigationController and the RoutingController do) sees every key the rest of the block adds after the `addController`, including the arguments of later operations. Add such a controller last in its block, or select and add it in a block of its own. (probed: "addController hands the controller the block's operationData itself, not a copy")
- The listener controllers behave the other way round: the DOMEventListenerController and the KeyboardController copy their `actionOperationData`, and each listener action starts from a fresh copy of it plus `eventTarget` (and `eventKey` for keys), so nothing the wiring block held reaches the handler. (probed: "a listener action starts with the listener's actionOperationData plus eventTarget, and eventKey for keys")
- A called action works on a copy as well: it gets its caller's operationData plus its arguments, and whatever it adds stays with it: a `selectElement` inside the callee does not change the caller's selection. (probed: "a called action gets a copy of the caller's operationData plus its arguments, and nothing flows back")

## Checklist

1. A loop count is `@@loopLength` plus one. (probed: "@@loopLength is the length of the collection minus one")
2. No condition tests a string that may be `"false"` or `"0"` bare. (probed: "a when condition treats the strings 'false' and '0' as true")
3. No condition tests a key that may be missing; a default is set first. (probed: "an == comparison against a property chain that does not resolve is strict, so it is false even against null")
4. Every negated comparison has its parentheses. (probed: "! binds tighter than ==, so !a == b compares (!a) with b")
5. Every host operation returns its operationData. (probed: "an operation that returns undefined hands the next operation an empty operationData")
