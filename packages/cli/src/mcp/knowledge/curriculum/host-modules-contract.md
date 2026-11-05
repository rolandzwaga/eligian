---
id: host-modules-contract
title: "Host module contract"
kind: workflow
use_cases:
  - "write host.ts"
see:
  - "assets-and-host-modules"
  - "map-dataflow"
  - "map-controllers"
card: "Host operations read parameters from the bag and return it; no NEEDS / PROVIDES; select first."
---

# Host module contract

A host module is the one place for code of your own. The program declares what it uses; the module exports it; the bundler wires the two together.

## Declaration and exports

```eligian
extensions "./host.ts" {
  operation stamp(label: string)
  controller Pulse(count: number)
  function formatPrice
}
```

One `extensions` import per program, path relative to the program. Parameters are `name`, `name?` (optional) or `name: string | number | boolean | object | array`; an untyped one accepts any of those types. The module exports three objects, keyed by the declared names:

```js
export const operations = { stamp(operationData) { … } };
export const controllers = { Pulse: class { … } };
export const functions = { formatPrice(operationData) { … } };
```

The tour's `examples/eligian-tour/host.js` is a complete, working module. A declared name the module does not export is `smoke-host-export-missing` in `eligian smoke`.

## Operations

A host operation is an Eligius operation: `function (this: IOperationScope, operationData) → operationData | Promise<operationData>` (`TOperation`, which `import type { TOperation } from 'eligius'` gives you in a `host.ts`; `eligius` comes with `eligian`).

- **Arguments arrive in the bag by their declared names.** `stamp("hello")` compiles to `{ systemName: "stamp", operationData: { label: "hello" } }`, and the function reads `operationData.label`.
- **What earlier operations of the same block left is in the bag too**, such as `selectedElement` (a jQuery object) after a `selectElement`.
- **Always return the bag**, after changing it if you want later operations to see something (`operationData.price = …; return operationData;`). Return a Promise of the bag for async work. An operation that returns `undefined` hands the next operation an empty bag (`runtime-engine-lifecycle`); `eligian smoke` reports it as `host-operation-returned-non-object`.

```js
export const operations = {
  stamp(operationData) {
    operationData.selectedElement.text(String(operationData.label));
    return operationData;
  },
};
```

## No NEEDS, no PROVIDES

Built-in operations declare what they need from the bag (`selectedElement` for `addClass`) and what they leave in it, and the checker follows that dataflow. A host operation declares neither: its signature (`hostSignature`, `packages/language/src/compiler/operations/host-operations.ts:73`) has `dependencies: []` and `outputs: []`. So:

- the checker cannot tell you that `stamp` needs a selected element: **select inside the block before calling it** (`selectElement`, `at … target "#el"`, or `with "#el" { stamp("hello") }`), or give the operation a `selector` parameter and select inside the function (`document.querySelector(operationData.selector)`, as the tour's `stampTime` does);
- whatever it adds to the bag is unknown to the checker: a later `addClass` after a host operation that selected an element itself is still the error `missing-dependency`.

The review pass catches the first case: a host operation with no `selectElement` before it in a block whose operation data starts empty (a timeline event, `on enter` / `on leave`, an event action) is the warning `host-operation-in-block-without-select`. A named action's body is exempt (it runs with its caller's selection), and so is an operation that declares a `selector` parameter.

## Controllers

A host controller is a class with the Eligius controller shape (`IController`):

```js
export const controllers = {
  Pulse: class {
    name = 'Pulse';
    init(operationData) {
      this.element = operationData.selectedElement;
      this.count = operationData.count;
    }
    attach(eventbus) { this.element.attr('data-pulse', String(this.count)); }
    detach(eventbus) { this.element.removeAttr('data-pulse'); }
  },
};
```

- `selectElement("#box") addController("Pulse", 3)` compiles to `getControllerInstance` and `addControllerToElement` with `{ count: 3 }`: the engine calls `init(operationData)` with the whole bag (the selected element plus the arguments by name), then `attach(eventbus)`. `attach` may return a Promise.
- `removeControllerFromElement("Pulse")` finds the controller on the element **by its `name` property** and calls `detach(eventbus)`. Set `name` to the declared name, or the removal finds nothing and only logs a warning.
- Undo in `detach` everything `attach` did (listeners, DOM, timers). Add the controller in `on enter` and remove it in `on leave`, like a built-in one.

## Functions

`function formatPrice` declares a function the module exports under `functions`; `customFunction("formatPrice")` calls it with the operation data.

## Checking it

`eligian_check` checks the calls against the declarations (names, argument counts and types) and runs the review pass; `eligian_project` lists the host declarations under `host`; `eligian_smoke` runs the module for real in its child process and reports runtime errors at the calling line. Run smoke after every change to the module: the checker sees the declarations, never the code.

see: assets-and-host-modules, map-dataflow, map-controllers
