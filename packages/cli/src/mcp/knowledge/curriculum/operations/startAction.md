---
operation: startAction
card: "Runs the start operations of the action that requestAction looked up, with actionOperationData merged into a copy of the caller's data. You do not write it: an action call name(args) compiles to requestAction + startAction, the arguments in actionOperationData under the parameter names."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action highlight(selector: string) [
  selectElement(selector)
  addClass("highlight")
]

action reveal(selector: string) [
  highlight(selector)
  selectElement(selector)
  addClass("visible")
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    highlight("#title")
  ] [
    selectElement("#title")
    removeClass("highlight")
  ]
  at 2s..4s [
    reveal("#box")
  ] [
    selectElement("#box")
    removeClass("visible")
    removeClass("highlight")
  ]
}
```

## Idioms

- Call actions by name, in timeline ranges and inside other actions: `highlight("#title")`.
  Inside `reveal`, `highlight(selector)` forwards the parameter of the same name, so its
  `actionOperationData` is empty: the called action gets `selector` from the merged data.
- An endable action called in an end block compiles to `endAction` instead.

## Pitfalls

- The called action works on its own copy: what it selects, adds or erases does not come
  back. The caller continues with its data from before, plus `actionInstance`, so `reveal`
  selects again after `highlight(…)`.
- The caller waits until the action's start operations have finished; a `wait` inside the
  action delays the caller too.
- A raw `startAction(…)` without a `requestAction` before it passes `check` and fails at
  runtime with `startAction: actionInstance is required`.
