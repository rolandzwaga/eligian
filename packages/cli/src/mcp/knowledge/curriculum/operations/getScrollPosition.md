---
operation: getScrollPosition
card: "Reads the window's scroll offsets in pixels into scrollX and scrollY. No parameters. It measures the page, not a scrolling element inside it."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action markScrolled [
  getScrollPosition()
  if ($operationdata.scrollY > 0) {
    selectElement("#title")
    addClass("highlight")
  } else {
    selectElement("#title")
    removeClass("highlight")
  }
]

timeline "main" in "#stage" using raf {
  on enter [ on click "#next" run markScrolled() ]
  on leave [
    with "#next" { removeControllerFromElement("DOMEventListenerController") }
    selectElement("#title")
    removeClass("highlight")
  ]
}
```

## Idioms

- Branch on `$operationdata.scrollY` in an `if`, or compute with it in `calc`.
- Return to a spot with `scrollToPosition` after reading the offsets.
- For content that follows scrolling, use a `using scroll` timeline instead of polling this.

## Pitfalls

- Inside a scrollable container (`overflow: auto`) the window does not scroll: both values
  stay 0.
- The value is read when the block runs; it does not update afterwards.
- `scrollX` and `scrollY` stay in the bag until a second call overwrites them.
