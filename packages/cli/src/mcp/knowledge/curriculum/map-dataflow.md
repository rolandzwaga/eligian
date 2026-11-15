---
id: map-dataflow
title: "Dataflow"
kind: mapping
use_cases:
  - "selectedElement is missing"
see:
  - "dataflow-tables"
  - "map-actions-and-calls"
card: "Each block starts with an empty bag; operations NEED, PROVIDE, ERASE."
---

## The core rule

Eligius runs a list of operations by handing one object, the operation data, from each
operation to the next. An operation reads its inputs from that object and writes its outputs
into it. **Inputs are consumed, outputs persist until overwritten**:

- `selectElement("#box")` reads `selector`, erases it, and provides `selectedElement`.
- `addClass("visible")` needs `selectedElement` and erases `className`. The selected element
  stays, so the next `addClass`, `removeClass` or `setStyle` acts on the same element.
- A second `selectElement` overwrites `selectedElement`.
- An action's parameters are in the same object. The compiler keeps them alive across the
  operations that erase them, a bare `clearOperationData()` included, for as long as the
  block still uses them: `selectElement(selector) … selectElement(selector)` works as written.
  `selectedElement` gets no such help: after a `clearOperationData()` it is gone until the
  next `selectElement`.

Each operation card states this in four lines: `NEEDS`, `PROVIDES`, `ERASES` and
`RESOLVES CHAINS IN` (see `operations-index`, or `eligian_operations` for one card).

## Where a bag starts

| Entry point | Starts with |
| --- | --- |
| an `at` start block or end block, a `sequence` / `stagger` item | nothing |
| `on enter` / `on leave` | nothing |
| a called action | its arguments under the parameter names, plus the caller's data |
| an event action (`on event`) | only `eventArgs`; a parameter compiles to `$operationData.eventArgs.<n>` |
| an `on <event>` / `on key` / `run` listener action | `eventTarget`, `eventKey`, its arguments |

Because an end block starts empty, it selects its element again. The `target "<selector>"`
shorthand writes that `selectElement` at the head of both blocks. `check` reports a missing
property at the entry point; the editor offers a quick fix that inserts the `selectElement`.

## Parameters are bag properties

An action parameter is a property of the action's operation data under its own name. Calling
`caption("#title", "Hello")` compiles to `requestAction` + `startAction` whose
`actionOperationData` holds `{ selector, text }`. Inside the action:

- an argument that forwards a parameter of the **same name** as the operation's field
  (`selectElement(selector)`) compiles to the bare operation: the property is already there;
- an argument under a **different** name (`setElementContent(text)` fills `template`) becomes a
  `$operationdata.text` chain. Most operations do not resolve chains, so the compiler moves it
  into a preceding `setOperationData`, which does (the `dataflow-tables` chunk lists which
  fields resolve chains themselves).

An end block of an endable action receives the arguments again through `endAction`, so the
same parameter works in both blocks.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

endable action caption(selector: string, text: string) [
  selectElement(selector)
  setElementContent(text)
  addClass("visible")
] [
  selectElement(selector)
  removeClass("visible")
]

timeline "Dataflow" in "#stage" using raf {
  at 0s..2s [
    selectElement("#box")
    addClass("visible")
    addClass("highlight")
  ] [
    selectElement("#box")
    removeClass("visible")
    removeClass("highlight")
  ]
  at 2s..4s caption("#title", "Hello")
}
```

Read the output: the first range selects `#box` once and adds two classes (the selection
persists); its end block selects again (empty bag). In `caption`, `selectElement` has no
`operationData` (the `selector` parameter is already in the bag) and `setElementContent` is
preceded by the `setOperationData` that resolves `$operationdata.text`.

## Rules of thumb

- Select in the same block that uses the element; never rely on a selection from another block,
  another range or the caller's caller.
- Outputs do not flow back: after a called action returns, the caller continues with its own
  data. Select again after the call when you need an element.
- After `if` / `else`, only properties provided in both branches remain; a `for` body adds
  nothing afterwards.
- Pass literals or parameters. A `$operationdata.` chain in a field that does not resolve chains
  arrives as text (Eligius lint `W150`, reported by `check`).
