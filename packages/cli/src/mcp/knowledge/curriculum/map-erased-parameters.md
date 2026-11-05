---
id: map-erased-parameters
title: "Erased parameters"
kind: mapping
use_cases:
  - "parameter is gone after selectElement"
  - "__eligian_param_ in the compiled output"
see:
  - "map-dataflow"
  - "dataflow-tables"
  - "map-actions-and-calls"
card: "Operations erase their inputs; the compiler saves and restores parameters you reuse."
---

## Inputs are erased after use

Every Eligius operation reads its inputs from the operation data and, for most of them, removes
those inputs once it has run. The operation card lists them on its `ERASES` line:
`selectElement` erases `selector`, `addClass` and `removeClass` erase `className`,
`setElementContent` erases `template`, `wait` erases `milliseconds`, and so on
(`dataflow-tables` has the full list). This is how Eligius works by design, not a bug: an input
belongs to one operation, and the next operation of the same kind needs its own.

Outputs are different: `selectedElement`, written by `selectElement`, stays until something
overwrites or clears it. That is why one `selectElement` serves several `addClass` calls.

## Why it matters for action parameters

An action's parameters live in the same operation data, under their own names. A parameter that
has the name of an operation's input is consumed by that operation: after
`selectElement(selector)` the property `selector` is gone. A second `selectElement(selector)`
would then select nothing, and so would forwarding the parameter to another action, or the next
iteration of a loop.

The compiler handles this for you. When a statement erases a parameter that the block still
uses afterwards (later in the same start or end block, or anywhere in an enclosing `for`), it
wraps the statement:

1. `setOperationData` copies the parameter to `__eligian_param_<name>`;
2. the erasing operations run;
3. `setOperationData` copies it back to `<name>`.

A bare `clearOperationData()` would clear the saved copy too, so in an action that still needs
parameters it compiles to `setOperationData` with `override: true` that keeps exactly those
parameters and drops everything else (the selected element included).

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action flash(selector: string, className: string) [
  selectElement(selector)
  addClass(className)
  selectElement("#title")
  addClass(className)
]

action twice(selector: string) [
  selectElement(selector)
  addClass("visible")
  flash(selector, "highlight")
]

action markAll(items: array, className: string) [
  for (item in items) {
    selectElement(@@item)
    addClass(className)
  }
]

timeline "Erased" in "#stage" using raf {
  at 0s..2s twice("#box")
  at 2s..4s markAll(["#title", "#box"], "visible")
}
```

Read the output:

- In `twice`, the first `selectElement` (bare: the parameter is already in the bag) is wrapped
  in the save and restore of `selector`, because `flash(selector, …)` still needs it. The call
  passes only `className` in `actionOperationData`: `selector` reaches `flash` through the
  caller's data, which the restore put back.
- In `flash`, `selectElement(selector)` is not wrapped: nothing uses `selector` after it.
  `addClass(className)` is wrapped, because the second `addClass` uses `className` again.
- In `markAll`, the single `addClass(className)` is wrapped: the next loop iteration uses it.

## What the compiler does not restore

- **The selected element.** `selectedElement` is an output, not a parameter. After
  `clearOperationData()` (or any operation that erases it) it is gone, and `check` reports the
  next operation that needs it as `erased-property-access`, naming the eraser. Select again.
- **Inputs you set yourself.** A value you put in the bag with `setOperationData` under an
  operation's input name is consumed like any other input. Pass the value to the operation as
  an argument instead, every time.

## Rules

- Write parameters as you would in any language: `selectElement(selector)` twice in a row is
  fine. Do not add your own save and restore, and never reference `__eligian_param_` names.
- Do not read an operation's input back from the bag after it ran
  (`$operationdata.className` after `addClass("visible")`): it is erased. Only a parameter of
  the action is kept alive, and you reach it by its name.
- Name parameters for what they mean. A parameter named like an input (`selector`,
  `className`) compiles to the bare operation, which is shorter; a different name compiles to a
  `$operationdata.<name>` chain, moved into a `setOperationData` when the operation does not
  resolve chains itself (`map-dataflow`). Both are correct.
