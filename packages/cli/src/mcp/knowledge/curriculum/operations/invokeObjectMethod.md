---
operation: invokeObjectMethod
card: "Calls a method of the object in instance: invokeObjectMethod(methodName, methodArguments?). The return value, awaited when it is a promise, lands in methodResult. Application code only: a controller or another app object. No operation provides instance, so copy it in with setOperationData, usually from the controllerInstance of getControllerFromElement."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

// host.ts exports a Counter controller class with an add(step) method
extensions "./host.ts" {
  controller Counter(start: number)
}

action bump(step: number) [
  selectElement("#box")
  getControllerFromElement("Counter")
  setOperationData({ instance: $operationdata.controllerInstance })
  invokeObjectMethod("add", [step])
  log($operationdata.methodResult, "count")
]

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#box")
    addController("Counter", 0)
  ]
  on leave [
    selectElement("#box")
    removeControllerFromElement("Counter")
  ]
  at 1s..2s bump(2)
}
```

## Idioms

- Talk to an attached controller: `selectElement`, `getControllerFromElement("<Name>")`,
  `setOperationData({ instance: $operationdata.controllerInstance })`, then the call.
- The arguments are an array literal; a parameter inside it (`[step]`) compiles to a chain that
  the `setOperationData` written by the compiler resolves.
- For logic of your own, a host operation (`extensions`) is simpler: it reads the bag directly
  and needs no `instance`.

## Pitfalls

- It needs `instance`: `check` reports `missing-dependency` until a `setOperationData` (or an
  action parameter named `instance`) supplies it.
- It throws for a DOM node, a jQuery object, `window`, built-in objects, native methods
  (`setTimeout`, `eval`, …) and the names `constructor`, `__proto__` and `prototype`.
- `getControllerFromElement` only warns when the controller is not attached; the call then
  throws because `instance` is undefined.
- It erases `methodName` and `methodArguments`.
