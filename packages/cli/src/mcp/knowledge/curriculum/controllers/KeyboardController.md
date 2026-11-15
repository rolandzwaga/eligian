---
controller: KeyboardController
status: recommended
card: "Runs actions by name when one of its keys is pressed. Prefer the on key interaction, which generates it; write addController yourself for several actions, the end: prefix, actionOperationData or scope \"element\". It wins over the engine's play and step keys, and ignores typing in form fields."
---

## Call

Attach it to the presentation's container; the keys are a hotkeys-js key string:

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action highlight(selector: string) [
  selectElement(selector)
  toggleClass("highlight")
]

timeline "Keys" in "#stage" using raf {
  on enter [
    selectElement("#stage")
    addController("KeyboardController", "h", ["highlight"], { selector: "#title" })
  ]
  on leave [
    with "#stage" { removeControllerFromElement("KeyboardController") }
  ]
}
```

## Idioms

- `on key "right" play` and the other `on key` interactions compile to this controller; use them
  when one verb is enough.
- The actions receive `eventTarget` (the focused element, or the body) and `eventKey` (the
  `KeyboardEvent.key`), on top of a copy of `actionOperationData`.
- With `scope` `"element"` the keys work only while the focus is inside the selected element;
  the default `"document"` works anywhere inside the engine root.

## Pitfalls

- A key the controller handles (space, the arrow keys, `home`, `end` included) no longer toggles
  playback or steps the timeline: bind those keys only when you mean to replace that behaviour.
- Presses in `input`, `select`, `textarea` and contenteditable elements are ignored; a held key
  runs the actions once.
- Remove it in `on leave`, once per controller attached (`controller-imbalance`).
