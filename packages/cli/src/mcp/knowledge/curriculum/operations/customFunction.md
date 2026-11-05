---
operation: customFunction
card: "Calls a function of the host module by its declared name: customFunction(name), the name declared in the extensions import (function formatPrice). The function receives the operation data and writes its results onto it; this is a view of the operation scope. Its return value is ignored, a returned Promise is awaited."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

extensions "./host.ts" {
  function formatPrice
}

timeline "main" in "#stage" using raf {
  at 0s..2s [
    setOperationData({ price: 12.5 })
    customFunction("formatPrice")
    selectElement("#title")
    setElementContent($operationdata.priceText)
  ]
}
```

The module (`host.ts`) exports it under `functions`:

```ts
export const functions = {
  formatPrice(operationData) {
    operationData.priceText = `€ ${operationData.price.toFixed(2)}`;
  },
};
```

## Idioms

- Inputs go into the operation data first (`setOperationData`, action parameters); results
  are read afterwards as `$operationdata.<name>` chains.
- Async work returns a Promise: the next operation waits for it.
- Inside a `for`, `this.currentItem` and `this.loopIndex` read the loop's values.
- A function that needs arguments is clearer as a host `operation` declaration: arguments by
  name, arity and types checked at the call.

## Pitfalls

- A name the extensions import does not declare is the warning `unknown_host_function`; a
  declared name the module does not export is `smoke-host-export-missing` in `eligian_smoke`,
  and a runtime error naming the `systemName`.
- `check` cannot see what the function writes: a later operation that needs a property the
  function provides (`selectedElement`) is still `missing-dependency`, and a
  `$operationdata.` chain to its output is not checked.
- Write onto `operationData`; a returned object is discarded.
- Run `eligian_smoke` after every change to the module: `check` sees the declaration, never
  the code.
