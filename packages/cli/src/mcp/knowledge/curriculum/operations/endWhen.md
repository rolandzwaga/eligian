---
operation: endWhen
card: "Closes an if: the operations after it run whatever the condition was. You do not write it: if (c) { … } else { … } compiles to when, the then-body, otherwise, the else-body, endWhen; each else if adds a nested when … endWhen inside the outer otherwise."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

endable action mark(level: number) [
  selectElement("#box")
  if (level > 2) {
    addClass("highlight")
  } else if (level > 0) {
    addClass("active")
  }
  addClass("visible")
] [
  selectElement("#box")
  removeClass("highlight")
  removeClass("active")
  removeClass("visible")
]

timeline "main" in "#stage" using raf {
  at 0s..2s mark(3)
  at 2s..4s mark(1)
}
```

## Idioms

- Steps both branches share go after the closing `}`: the probe adds `visible` in every case.
- `else if` closes with two `endWhen` operations, one per `when`; the compiler writes both.
- A `break` or `continue` inside an `if` within a `for` reaches its loop through the `endWhen`.

## Pitfalls

- A raw `endWhen()` without a `when` before it is the error `control_flow`: write `if`.
- After the `endWhen`, only what both branches provide is certain: a selection made in one
  branch only is missing afterwards, so select before the `if` or again after it.
- An empty then-branch is the warning `if-empty-then`.
- The end block does not know which branch ran: undo every branch there, as the probe's end
  list removes all three classes.
