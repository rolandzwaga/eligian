---
operation: when
card: "Skips the operations after it until otherwise / endWhen when its expression is false. You do not write it: `if (cond) { … } else { … }` compiles to when, the then-body, otherwise, the else-body, endWhen, with the condition turned into the expression string."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action mark(level: number, label: string) [
  selectElement("#box")
  if (level >= 2 && label != "skip") {
    addClass("highlight")
  } else if (level == 1) {
    addClass("active")
  } else {
    removeClass("highlight")
  }
]

action unmark [
  selectElement("#box")
  removeClass("highlight")
  removeClass("active")
]

timeline "main" in "#stage" using raf {
  at 0s..2s [ mark(2, "go") ] [ unmark() ]
  at 2s..4s [ mark(1, "go") ] [ unmark() ]
}
```

## Idioms

- Branch on parameters, loop values (`@@loopIndex`), outputs (`$operationdata.isValid`) and
  `$globaldata`.
- `else if` nests a second `when` … `endWhen` inside the outer `otherwise`.

## Pitfalls

- The condition is evaluated at runtime: no arithmetic on runtime values
  (`runtime_operator_operand`); compute with `calc` first, then compare
  `$operationdata.calculationResult`.
- `==` and `!=` compare strictly: `"1" == 1` is false.
- A bare value is true when truthy: the strings `'false'` and `'0'` are true.
- Comparisons do not chain: write `0 < x && x < 5`.
- After an `if` / `else`, only what both branches provide is certain.
- A raw `when(…)` without `endWhen()` is an error (`control_flow`); write `if`.
