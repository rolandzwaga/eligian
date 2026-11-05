---
operation: reparentElement
card: "Moves the selected element(s) into a new parent: reparentElement(newParentSelector). Its data, event handlers and attached controllers move with it. The selector is resolved inside the engine root and must match exactly one element. Move it back in the end block so a seek restores the layout."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#box")
    reparentElement("#stage")
  ] [
    selectElement("#box")
    reparentElement("#panel")
  ]
}
```

## Idioms

- Pair the move with the move back: the start block reparents, the end block returns the element
  to its layout parent.
- The element is appended as the parent's last child; style its new position with a class on
  the parent or the element.

## Pitfalls

- It needs `selectedElement`.
- The selector must match exactly one element inside the presentation root: none or several
  throws (`matched … elements, expected exactly one`). An HTML string is refused.
- `newParentSelector` is validated like any selector: its classes and ids must exist in the
  imported CSS or the layout.
- It erases `newParentSelector`; the selection stays on the moved element.
