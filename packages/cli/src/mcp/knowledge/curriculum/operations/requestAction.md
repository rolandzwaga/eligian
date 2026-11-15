---
operation: requestAction
card: "Looks up an action by name and puts it in actionInstance: requestAction(systemName). Every action call compiles to requestAction followed by startAction (endAction in an end block of an endable action), so write spotlight(\"#box\") instead of the pair. Write it by hand only when porting Eligius JSON; startAction then takes the arguments as one object keyed by parameter name."
---

## Example

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

timeline "main" in "#stage" using raf {
  at 0s..2s spotlight("#box")
  at 2s..4s [
    requestAction("spotlight")
    startAction({ selector: "#title" })
  ] [
    requestAction("spotlight")
    endAction({ selector: "#title" })
  ]
}
```

## Idioms

- Call actions by name, like operations: `spotlight("#box")`. The compiler writes
  `requestAction` + `startAction`, and for an endable action called from an `at` event the
  `endAction` in the end block, with the same arguments.
- A click or key that starts an action: `on click "#next" run spotlight("#box")` in `on enter`.

## Pitfalls

- The name must be an emitted action. A name that does not exist compiles; `check` reports it
  as `eligius-E310` (Eligius lint, run once the program has no errors) and the engine throws
  at `requestAction`.
- The emitted name can differ from the source name: an alias of an import, or
  `<library>.<action>` for a library helper reached through calls. A call gets it right; a
  hand-written string does not follow renames.
- `startAction` arguments are one object keyed by parameter name, not a positional list.
