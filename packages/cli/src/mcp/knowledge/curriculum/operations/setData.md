---
operation: setData
card: "Writes values to named targets: setData({ \"$operationdata.<name>\": v, \"$globaldata.<name>\": v, \"$scope.<chain>\": v }). Values that are property chains are resolved first, so it copies data between the bag, global data and the scope in one step. A program-level const that depends on runtime data compiles to a setData in the init action."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action note(label: string) [
  setData({ "$globaldata.lastLabel": label, "$operationdata.shown": true })
]

action announce [
  selectElement("#title")
  setElementContent($globaldata.lastLabel)
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    note("intro")
    announce()
  ] [
    selectElement("#title")
    setElementContent("")
  ]
}
```

## Idioms

- Keep a value for later actions or timelines: `setData({ "$globaldata.<name>": <value> })`,
  read back as `$globaldata.<name>`.
- Put a computed value under the name an operation reads:
  `setData({ "$operationdata.arrayData": $globaldata.items })`.
- `$scope.variables.<name>` changes an action variable (the one `@name` reads), also from
  inside an `if` or `for` body.

## Pitfalls

- Every key starts with `$operationdata.`, `$globaldata.` or `$scope.` and names a property:
  `check` reports `invalid_setdata_target` otherwise (a missing `$` has a quick fix).
- Keys are quoted strings; the object is the single argument.
- Only `$operationdata` keys add to the bag; writes to global data are not undone by a seek
  or by leaving the timeline.
