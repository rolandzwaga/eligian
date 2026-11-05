---
operation: addGlobalsToOperation
card: "Copies global data into the operation data: addGlobalsToOperation([\"name\", …]) puts each named global under the same name in the bag, then erases globalProperties. The counterpart of setGlobalData, which stores bag properties as globals."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action remember(theme: string) [
  setGlobalData(["theme"])
]

action recall [
  addGlobalsToOperation(["theme"])
  log($operationdata.theme, "theme")
]

timeline "main" in "#stage" using raf {
  at 0s..1s remember("dark")
  at 1s..2s recall()
}
```

## Idioms

- `setGlobalData(["theme"])` in one block, `addGlobalsToOperation(["theme"])` in a later one:
  the value crosses blocks, ranges and actions, which the operation data does not.
- For one value in one field, `$globaldata.theme` as the argument is shorter
  (`setElementContent($globaldata.theme)`): the compiler resolves it through a
  `setOperationData`.

## Pitfalls

- Plain data is copied, so changing the copy does not change the global; jQuery objects, DOM
  nodes, functions and class instances are added by reference.
- The names `__proto__`, `prototype` and `constructor` throw at runtime.
- A name that was never stored arrives as `undefined`; `check` does not track global data.
