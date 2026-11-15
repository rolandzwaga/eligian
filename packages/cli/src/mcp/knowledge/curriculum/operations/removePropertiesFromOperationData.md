---
operation: removePropertiesFromOperationData
card: "Deletes the named properties from the operation data: removePropertiesFromOperationData([\"json\", \"selectedElement\"]). Use it to drop a large or stale value before the rest of the list, or a called action, sees it. check tracks the removal: a later operation that needs a removed property is erased-property-access."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action showName [
  loadJson("./anim.json")
  selectElement("#title")
  setElementContent($operationdata.json.nm)
  removePropertiesFromOperationData(["json", "selectedElement"])
  log()
]

timeline "main" in "#stage" using raf {
  at 0s..2s showName()
}
```

## Idioms

- After using a big payload (`json`, `response`, `mappedArray`), drop it before calling more
  actions: a called action starts with the caller's whole operation data.
- `clearOperationData()` with no argument empties everything; this operation names what goes.

## Pitfalls

- The list is an array of property names, also for one name.
- Removing `selectedElement` means the next element operation needs a new `selectElement`;
  `check` reports `erased-property-access` otherwise.
- Action parameters are properties too: removing one breaks a later use of the parameter, and
  `check` does not catch that (the compiler's save / restore of erased parameters does not
  cover this operation).
