---
operation: setVariable
card: "Sets a variable of the running action: setVariable(name, value), read back as $scope.variables.<name>. You rarely write it: a const inside an action whose value is only known at runtime compiles to setVariable, and @name reads it. A variable belongs to the action, so a value set inside an if or for body is still there after it."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action mark(selector: string) [
  const target = selector
  selectElement(@target)
  addClass("active")
]

action tally [
  setVariable("count", 3)
  selectElement("#title")
  setElementContent($scope.variables.count)
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    mark("#box")
    tally()
  ] [
    selectElement("#box")
    removeClass("active")
    selectElement("#title")
    setElementContent("")
  ]
}
```

## Idioms

- `const x = <runtime value>` in an action instead of a raw `setVariable`; read it as `@x`.
- Change a variable later, also from an `if` / `for` body:
  `setData({ "$scope.variables.x": <value> })`.

## Pitfalls

- `@name` only refers to a `const`; a variable set by a raw `setVariable` is read as
  `$scope.variables.<name>`.
- A `const` the compiler can compute is folded into its uses and never becomes a
  `setVariable`.
- Variables belong to the action; values another action or timeline needs go in global data
  (`setData`, `setGlobalData`).
- `__proto__`, `prototype` and `constructor` as names throw at runtime.
