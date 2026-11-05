---
operation: endAction
card: "Runs the end operations of the endable action that requestAction looked up, with actionOperationData merged into a copy of the caller's data. You do not write it: an endable action called in an end block compiles to requestAction + endAction, and an at event that calls one directly gets the start and the end half."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

endable action spotlight(selector: string) [
  selectElement(selector)
  addClass("highlight")
] [
  selectElement(selector)
  removeClass("highlight")
]

timeline "main" in "#stage" using raf {
  at 0s..2s spotlight("#title")
  at 2s..4s [
    spotlight("#box")
    selectElement("#panel")
    addClass("visible")
  ] [
    spotlight("#box")
    selectElement("#panel")
    removeClass("visible")
  ]
}
```

## Idioms

- `at 0s..2s spotlight("#title")`: the start block starts the action, the end block ends it,
  both with the same arguments.
- In a block pair, call the endable action in both blocks with the same arguments; the
  compiler writes `startAction` in the first and `endAction` in the second.
- The end list receives the arguments again, so it uses the same parameters as the start list.
  Write it as the exact inverse of the start list.

## Pitfalls

- Only endable actions have an end list: a plain action called in an end block compiles to
  `startAction` and runs its operations.
- The action works on its own copy: what its end list selects or erases does not come back,
  the caller continues with its data from before (`actionOperationData` removed).
- A raw `endAction()` in a timeline block is `missing-dependency` (`actionInstance`): call
  the action instead.
