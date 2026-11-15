---
id: map-test
title: "Map: test probe"
kind: mapping
use_cases:
  - literate probe
see:
  - operations-index
card: A mapping chunk with one literate probe, for the knowledge drift spec.
---

A named action selects an element and adds a class; the timeline calls it.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action highlight(selector: string) [
  selectElement(selector)
  addClass("highlight")
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    highlight("#title")
  ] [
    selectElement("#title")
    removeClass("highlight")
  ]
}
```

The compiled fragment above is spliced in by the generator.

see: operations-index
