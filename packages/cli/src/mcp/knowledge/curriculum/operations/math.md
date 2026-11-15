---
operation: math
card: "Calls a JavaScript Math function at runtime: math(args, functionName), e.g. math([value, 100], \"min\"); the result lands in mathResult. It resolves chains in args itself, and a constant name in args (\"PI\") becomes its value. For + - * / % use calc; arithmetic on constants folds at compile time."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action clamp(score: number) [
  math([score, 100], "min")
  log($operationdata.mathResult, "clamped")
  math(["PI", 2], "pow")
  log($operationdata.mathResult, "pi squared")
]

timeline "main" in "#stage" using raf {
  at 0s..1s clamp(140)
}
```

## Idioms

- `min` / `max` to clamp a runtime value, `round` / `floor` / `ceil` for whole numbers, `random`
  with `[]` for a random number.
- Read the result as `$operationdata.mathResult`; a second `math` overwrites it.
- Values known at compile time need no operation: `const half = 10 / 2` folds.

## Pitfalls

- `functionName` must be a function of `Math`; `check` does not verify the name, an unknown
  one throws at runtime (`math: unknown function`).
- `args` is always an array, also for one argument (`math([x], "abs")`).
- Arithmetic operators on runtime values are an error (`runtime_operator_operand`); `calc` or
  `math` does it at runtime.
- It erases `args` and `functionName`.
