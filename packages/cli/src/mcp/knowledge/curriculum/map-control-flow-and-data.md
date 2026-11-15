---
id: map-control-flow-and-data
title: "Control flow and data references"
kind: mapping
use_cases:
  - "if else in an action"
  - "loop over a list"
  - "read a parameter, constant or loop item"
see:
  - "map-dataflow"
  - "map-erased-parameters"
  - "operations-index"
card: "if / for / break / with compile to when, forEach, …; references to chains."
---

## Statements become operations

Control flow is sugar: each statement compiles to Eligius operations in the same list, run by
the engine at runtime. There is no `while`.

| Eligian | Compiles to |
| --- | --- |
| `if (<cond>) { … }` | `when` (`expression`), the body, `endWhen` |
| `if (<cond>) { … } else { … }` | `when`, then-body, `otherwise`, else-body, `endWhen` |
| `else if (<cond>) { … }` | a nested `when` … `endWhen` inside the outer `otherwise` |
| `for (x in <collection>) { … }` | `forEach` (`collection`, `itemName`), the body, `endForEach` |
| `break` / `continue` | `breakForEach` / `continueForEach`; only inside a `for` |
| `with "<sel>" { … }` | `selectElement`, then the body; the selection stays afterwards |
| `const x = …` in an action | folded when constant, else `setVariable` |

`break` or `continue` outside a loop is an error (`break-outside-loop`,
`continue-outside-loop`).

## References: from source to chains

The engine reads runtime values through property chains. The compiler writes them for you:

| You write | Compiles to | What it is |
| --- | --- | --- |
| `selector` (a parameter) | `$operationdata.selector` | the action's argument |
| `@name` (a constant) | its value, or `$scope.variables.name` | `const` in the program or action |
| `@@<loop variable>`, `@@currentItem` | `$scope.currentItem` | the item of the enclosing `for` |
| `@@loopIndex`, `@@loopLength` | `$scope.loopIndex`, `$scope.loopLength` | 0-based index; length minus one |
| `$operationdata.a.b` | itself | any property of the bag |
| `$globaldata.a` | itself | data shared by every action of the presentation |
| `$scope.a`, `@@a` (any other name) | `$scope.a` | the engine's scope object |

Inside `for (id in ids)`, the item is `@@id`. `@@item` there is not the item: it compiles to
`$scope.item`, which nothing sets, and `check` does not catch the mix-up. Use the loop
variable's own name.

## Conditions and expressions

A condition becomes the string of a `when` expression, evaluated at runtime: parameters and
`@@` names turn into chains, string literals into single-quoted strings,
`(enabled)` into `$operationdata.enabled`. `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||` and `!`
are kept.

Arithmetic happens at compile time only. `2 * 3`, `"#" + "box"` and expressions over constants
fold to a value. With a runtime value:

- `+` with a string operand (a literal, or a parameter typed `: string`) compiles to
  `concatenateStrings` over the parts; its `result` feeds the operation that uses it.
- any other arithmetic on runtime values is an error (`runtime_operator_operand`): use the
  `calc` operation, whose result is `$operationdata.calculationResult`.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action revealUpTo(items: array, limit: number) [
  for (item in items) {
    if (@@loopIndex >= limit) {
      break
    }
    selectElement(@@item)
    addClass("visible")
  }
]

action lightAll(ids: array, skip: string) [
  for (id in ids) {
    if (@@id == skip) {
      continue
    }
    with "#" + @@id { addClass("active") }
  }
]

action setActive(enabled: boolean) [
  selectElement("#box")
  if (enabled) {
    addClass("highlight")
  } else {
    removeClass("highlight")
  }
]

timeline "Flow" in "#stage" using raf {
  at 0s..2s revealUpTo(["#title", "#box", "#panel"], 2)
  at 2s..4s lightAll(["title", "box", "panel"], "box")
  at 4s..6s setActive(true)
}
```

Read the output:

- `revealUpTo`: `forEach` over `$operationdata.items`; the condition became
  `$scope.loopIndex >= $operationdata.limit` and `break` became `breakForEach` inside the
  `when` … `endWhen`. `selectElement` reads the item from `$scope.currentItem`.
- `lightAll`: `"#" + @@id` became `setOperationData` (`strings`), `concatenateStrings`, and a
  `selectElement` of `$operationdata.result`.
- `setActive`: `when` / `otherwise` / `endWhen` around the two branches.

## Rules

- Every branch and loop body runs in the same operation data as the list around it. After an
  `if` / `else`, only what both branches provide is certain; a `for` body provides nothing
  afterwards (`map-dataflow`).
- Select inside the loop body, from the item: `selectElement(@@item)` or `with`.
- Pass lists as array literals, parameters or constants. A loop over a list that is known at
  compile time still runs at runtime: the compiler does not unroll it.
- For time-based repetition (one item every 200 ms), use `stagger` or `sequence` on the
  timeline, not a `for` with `wait`: timeline ranges follow seeks and pauses, a `wait` inside
  an operation list does not.
- Program-level data that changes at runtime goes in `$globaldata` (`setGlobalData`); a
  `const` never changes.
