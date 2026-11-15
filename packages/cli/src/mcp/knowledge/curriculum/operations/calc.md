---
operation: calc
card: "Runtime arithmetic: calc(left, right, operator) with operator one of + - * / % **, the result in calculationResult. left, right and operator resolve $operationdata / $globaldata / $scope chains. Use it where Eligian arithmetic on a runtime value is an error (runtime_operator_operand); constant arithmetic folds at compile time."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action numbered(items: array) [
  for (item in items) {
    calc(@@loopIndex, 1, "+")
    selectElement(@@item)
    setElementContent($operationdata.calculationResult)
  }
]

action total(price: number, count: number) [
  calc(price, count, "*")
  selectElement("#box")
  setElementContent($operationdata.calculationResult)
]

timeline "main" in "#stage" using raf {
  at 0s..2s numbered(["#title", "#box"])
  at 2s..4s total(3, 4)
}
```

## Idioms

- 1-based numbering in a loop: `calc(@@loopIndex, 1, "+")`.
- Read the result as `$operationdata.calculationResult` in the next operation; the compiler
  resolves it through a `setOperationData` where the field does not resolve chains itself.
- `2 * 3` or `@gap * 2` over constants needs no `calc`: the compiler folds it.

## Pitfalls

- The operands are converted with unary `+`: a runtime string that is not a number gives
  `NaN`, with no error. A string literal is a type error in `check` (`parameter_type`).
- An operator outside the six throws at runtime.
- Each `calc` overwrites `calculationResult`; use the result before the next one, or copy it
  with `setOperationData`.
