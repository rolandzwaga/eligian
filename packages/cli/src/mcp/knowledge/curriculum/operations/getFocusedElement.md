---
operation: getFocusedElement
card: "Puts the element that has keyboard focus (document.activeElement, usually the body when nothing else has it) in focusedElement as a jQuery collection. No parameters. It does not change selectedElement: copy it there with setOperationData to act on it."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action markFocus [
  getFocusedElement()
  setOperationData({ selectedElement: $operationdata.focusedElement })
  addClass("highlight")
]

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#next")
    setFocus()
    on key "Enter" run markFocus()
  ]
  on leave [
    with "#stage" { removeControllerFromElement("KeyboardController") }
    selectElement("#next")
    removeClass("highlight")
  ]
}
```

## Idioms

- In a key or click handler, find what the user is on, then copy it into `selectedElement`
  (`setOperationData` resolves the chain) and use the DOM operations.
- Remember focus before a change and put it back with `setFocus` on the same element.

## Pitfalls

- `focusedElement` is not `selectedElement`: without the `setOperationData`, an `addClass`
  after it acts on the previous selection.
- Focus moves with the user: reading it in a timeline range gives whatever has focus at that
  moment.
- A class added to the focused element is not seen by `check`'s class balance; remove it
  yourself.
