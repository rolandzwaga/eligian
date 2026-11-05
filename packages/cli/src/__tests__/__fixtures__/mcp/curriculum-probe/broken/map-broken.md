---
id: map-broken
title: "Map: broken probe"
kind: mapping
use_cases:
  - literate probe
see:
  - operations-index
card: A mapping chunk whose probe does not compile, for the knowledge drift spec.
---

This probe calls an operation that does not exist.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    noSuchOperation("#title")
  ]
}
```

see: operations-index
