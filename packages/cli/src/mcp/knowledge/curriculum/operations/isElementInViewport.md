---
operation: isElementInViewport
card: "Sets isInViewport: true when the selected element lies entirely inside the browser viewport (all four edges of its bounding rectangle), false otherwise, also when it is only partly visible. Needs selectedElement; branch on the result with if ($operationdata.isInViewport)."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action markVisible [
  selectElement("#box")
  isElementInViewport()
  if ($operationdata.isInViewport) {
    addClass("visible")
  } else {
    removeClass("visible")
  }
]

timeline "main" in "#stage" using raf {
  at 0s..4s markVisible()
}
```

## Idioms

- `selectElement`, `isElementInViewport()`, then `if ($operationdata.isInViewport) { … }`: the
  selection survives the call, so both branches act on the same element.
- It measures once, when it runs. To follow scrolling, use a `scroll` timeline provider or bring
  the element into view with `scrollToElement`.

## Pitfalls

- It needs `selectedElement`; it measures the first selected element.
- Partly visible is `false`: the whole rectangle must fit in the window.
- It measures layout: under `eligian smoke` (jsdom, no layout) every rectangle is zero-sized, so
  the result there says nothing about a browser. Verify in `dev`.
