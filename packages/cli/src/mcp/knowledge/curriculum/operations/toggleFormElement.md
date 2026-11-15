---
operation: toggleFormElement
card: "Enables or disables the selected form control(s): toggleFormElement(enabled), true enables, false disables (the disabled property). It does not flip the state, despite its name. For input, select, textarea and button elements."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..3s target "#next" [
    toggleFormElement(false)
  ] [
    toggleFormElement(true)
  ]
}
```

## Idioms

- Lock a button while a part plays: `toggleFormElement(false)` in the start block,
  `toggleFormElement(true)` in the end block; `target` selects in both.
- From a boolean parameter: `toggleFormElement(enabled)` inside an action with an
  `enabled: boolean` parameter.

## Pitfalls

- It needs `selectedElement`, and unlike `addClass` an empty selection is an error: the engine
  throws `toggleFormElement: selectedElement is required` when the selector matched nothing.
- `enabled` is required and erased; there is no flipping form without it.
- On elements that are not form controls the `disabled` property has no effect.
