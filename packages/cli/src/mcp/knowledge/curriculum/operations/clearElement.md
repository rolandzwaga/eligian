---
operation: clearElement
card: "Removes all children of the selected element; the element itself stays. Controllers attached to the removed children or their descendants are detached first; controllers on the element itself stay attached. clearElement() takes no arguments."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..3s [
    selectElement("#title")
    clearElement()
    setElementContent("Chapter two")
  ] [
    selectElement("#title")
    clearElement()
  ]
}
```

## Idioms

- Empty a container before filling it again: `clearElement()` then `setElementContent(…)`
  or `createElement` children.
- In an end block, `clearElement()` removes what the start block inserted.

## Pitfalls

- It needs `selectedElement`.
- Nothing restores the removed children: an end block or a seek back does not bring layout
  content back. To hide content for a range, use classes (`addClass` / `removeClass`).
- When a child's controller throws in `detach`, the operation fails with an `AggregateError`;
  the element is cleared anyway.
