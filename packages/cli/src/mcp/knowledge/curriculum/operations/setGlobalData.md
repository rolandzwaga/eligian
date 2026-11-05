---
operation: setGlobalData
card: "Copies named properties of the operation data into global data: setGlobalData([\"name\", ...]), a list of property names, not chains. Every later action and timeline reads them as $globaldata.<name>. Plain data is deep-copied; DOM nodes, controllers and functions are stored by reference. To write one value directly, setData({ \"$globaldata.<name>\": value })."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action keepBest(points: number) [
  setOperationData({ best: points })
  setGlobalData(["best"])
]

action showBest [
  selectElement("#title")
  setElementContent($globaldata.best)
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    keepBest(7)
    showBest()
  ] [
    selectElement("#title")
    setElementContent("")
  ]
}
```

## Idioms

- Keep an operation's output for other actions: `loadFromStorage(…)` then
  `setGlobalData(["loadedValue"])`, or `getCurrentTime()` and the like.
- Values shared by the whole presentation (a score, a chosen language, a list) live in global
  data; an action's own values are `const` / variables.

## Pitfalls

- A name that is not in the operation data at that point is skipped without an error.
- The properties stay in the operation data as well; only `propertyNames` is erased.
- Global data lasts for the whole presentation: a seek or leaving a timeline does not undo it.
  Reset it in `on enter` when a re-entry should start clean.
- `__proto__`, `prototype` and `constructor` as names throw at runtime.
