---
controller: MutationObserverController
status: recommended
card: "Watches the selected element with a MutationObserver and broadcasts every change as a dom-mutation event. Its seven options are positional: observeAttributes, observeChildList, observeCharacterData, observeSubtree, attributeOldValue, characterDataOldValue, attributeFilter."
---

## Call

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Observer" in "#stage" using raf {
  on enter [
    selectElement("#panel")
    addController("MutationObserverController", true, true, false, true)
  ]
  on leave [
    with "#panel" { removeControllerFromElement("MutationObserverController") }
  ]
}
```

The call above observes attributes, child nodes and the whole subtree of `#panel`, not text
changes.

## Idioms

- The mutations arrive on the eventbus as `dom-mutation` events; use it to react to content
  that something outside the timeline changes (a host module, a form).
- `attributeFilter` (an array of attribute names) limits the attribute mutations; it is the
  seventh argument, so the six before it must be given.

## Pitfalls

- The arguments are positional booleans: a `true` in the wrong place observes something else,
  so count them against the order in the card.
- Observing the subtree of a large element broadcasts on every change; keep the observed element
  small, and remove the controller in `on leave`.
