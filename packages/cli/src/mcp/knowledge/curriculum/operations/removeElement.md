---
operation: removeElement
card: "Removes the selected element(s) from the DOM, detaching the controllers attached to them or inside them first. Needs selectedElement. Permanent: nothing puts the element back when a seek returns to an earlier time. Remove what the program created; hide layout elements with a class instead."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    selectElement("#panel")
    setElementContent("<p class=\"highlight\">Note</p>", "append")
  ] [
    selectElement("#panel p.highlight")
    removeElement()
  ]
}
```

## Idioms

- Create in the start block, remove in the end block: the range shows the element and a seek
  in either direction leaves the DOM as the layout wrote it.
- For a layout element that comes and goes, `addClass` / `removeClass` (or `toggleElement`)
  instead: it survives seeks and replays.
- `clearElement` empties an element but keeps it.

## Pitfalls

- It needs `selectedElement`; every selected element is removed.
- An element of the layout removed in a start block is gone for the rest of the visit: a seek
  back or a replay does not restore it, and later `selectElement` calls find nothing.
- `selectedElement` stays in the bag but points at detached nodes; select again before acting
  on the page.
