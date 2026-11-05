---
id: map-actions-and-calls
title: "Actions and calls"
kind: mapping
use_cases:
  - "define an action"
see:
  - "map-dataflow"
  - "operations-index"
card: "Actions, endable actions, calls: requestAction + startAction / endAction."
---

## Two kinds of action

```
action name(p: type, ...) [ operations ]
endable action name(p: type, ...) [ start operations ] [ end operations ]
```

- A plain `action` has only start operations. Called as an `at` event it runs when the range
  starts; nothing runs when the range ends.
- An `endable action` has an end list, which runs when the range ends (or when the action is
  ended from an end block or `on leave`). Write the end list as the exact inverse of the start
  list: remove the classes the start added, hide what it showed.
- Parameters may be typed (`string`, `number`, `boolean`, `object`, `array`) or left untyped;
  typing lets `check` catch a wrong argument at the call site.
- Action names may not collide with operation names (`check` reports it). In a `library` file
  a `private` action is not importable.

## One call syntax

`fadeIn("#box")` and `addClass("visible")` look the same. The compiler resolves a name as an
action of the program (local or imported) first, then as an Eligius operation. Wherever a call
is allowed (an `at` event, inside a block, `sequence` and `stagger` items, `if` / `for` bodies,
`on enter` / `on leave`), both work.

A call to an action compiles to two operations:

1. `requestAction` with `systemName` = the action's name;
2. `startAction` with `actionOperationData` = the arguments under the parameter names, or
   `endAction` when the call is in an end block and the action is endable.

When an `at` event calls an endable action directly, the compiler writes both: the start block
starts it, the end block ends it, with the same arguments.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

endable action spotlight(selector: string) [
  selectElement(selector)
  addClass("highlight")
] [
  selectElement(selector)
  removeClass("highlight")
]

endable action greet(text: string) [
  selectElement("#title")
  setElementContent(text)
  spotlight("#box")
] [
  spotlight("#box")
]

timeline "Calls" in "#stage" using raf {
  at 0s..3s spotlight("#title")
  at 3s..6s greet("Welcome")
}
```

Read the output: the actions appear once each under `actions`, and the timeline only refers to
them by name. `greet` calls `spotlight` with `startAction` in its start list and with
`endAction` in its end list.

## What a called action sees

- It starts with the caller's operation data plus its own arguments, so it may rely on an
  element the caller selected. `check` infers what each action reads without creating it and
  reports a call site that does not provide it (`Action 'highlight' requires
  'selectedElement' ...`).
- Its outputs do not flow back. After the call the caller continues with its own data, so a
  selection made inside the called action is gone; select again (see `map-dataflow`).
- Calls do not return values: pass what an action needs as arguments.

## When to write an action

- The same start / end pair is used at more than one place: make it an endable action and
  call it with different arguments.
- A listener (`on click "<sel>" run name(...)`) or a controller's `actions` list needs a named
  action: those run actions by name.
- A one-off range is clearer inline: `at 0s..2s target "#box" [ addClass("visible") ]
  [ removeClass("visible") ]`.
