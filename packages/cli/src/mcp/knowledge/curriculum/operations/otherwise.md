---
operation: otherwise
card: "The else branch of a when … endWhen block. Eligian writes it for you: if (<cond>) { … } else { … } compiles to when, the then-body, otherwise, the else-body, endWhen; else if nests a second when inside the otherwise. Write the if / else form, never a bare otherwise() call."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action level(score: number) [
  selectElement("#box")
  if (score > 2) {
    addClass("highlight")
  } else if (score > 0) {
    addClass("active")
  } else {
    addClass("visible")
  }
]

timeline "main" in "#stage" using raf {
  at 0s..2s level(1)
  on leave [
    selectElement("#box")
    removeClass("highlight")
    removeClass("active")
    removeClass("visible")
  ]
}
```

## Idioms

- `if (…) { … } else { … }` in any operation list: actions, start and end blocks, `on enter`.
- `else if` chains compile to nested `when` blocks, each closed by its own `endWhen`.
- Read the compiled output (`eligian_compile`) to see the `when` / `otherwise` / `endWhen`
  layout.

## Pitfalls

- A bare `otherwise()` outside a `when` block is the error `control_flow`.
- After the branches, only what both of them provide is certain: select again after an
  `if` / `else` when only one branch selected.
- `otherwise` takes no arguments and changes nothing in the operation data.
