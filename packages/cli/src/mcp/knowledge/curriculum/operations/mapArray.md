---
operation: mapArray
card: "Maps every item of arrayData through a JavaScript function into mappedArray: mapArray(mapFunction). The compiled JSON cannot hold a function, so the function must already be in the bag, put there by a host operation, and is passed as a chain. Without a host module, use a for loop instead."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

// host.ts: operations.pickLabeler puts a function in operationData.labeler
extensions "./host.ts" {
  operation pickLabeler()
}

action labels(arrayData: array) [
  pickLabeler()
  mapArray($operationdata.labeler)
  log($operationdata.mappedArray, "labels")
]

timeline "main" in "#stage" using raf {
  at 0s..2s labels([1, 2, 3])
}
```

## Idioms

- Pass the list as an action parameter named `arrayData`; the operation reads it from the bag
  under that name.
- Pass the function as a chain (`$operationdata.labeler`); the compiler resolves it into
  `mapFunction` with a `setOperationData` before the call.
- When the work is per item and visual (select, add a class), a `for (item in items) { … }`
  loop needs no function at all.

## Pitfalls

- A string or any other literal is a `parameter_type` error: `mapFunction` takes a function
  only.
- It needs `arrayData` (an array, else it throws); nothing but a parameter or a
  `setOperationData` provides it.
- The checker cannot see what a host operation adds to the bag, so a missing function shows up
  only at runtime (`mapArray: mapFunction is required and must be a function`).
- It erases `mapFunction`; `arrayData` and `mappedArray` stay.
