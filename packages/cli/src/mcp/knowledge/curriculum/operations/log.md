---
operation: log
card: "Writes to the browser console: log(value, name?) logs one value; log() with no argument logs the whole operation data, the global data and the scope. A debugging aid: it changes nothing, and smoke reports console output only for warnings and errors."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action inspect(selector: string) [
  selectElement(selector)
  log(selector, "selector")
  log()
]

timeline "main" in "#stage" using raf {
  at 0s..1s [
    log("intro starts")
  ] [
    log("intro ends")
  ]
  at 1s..2s inspect("#box")
}
```

## Idioms

- `log("<label>")` in a start and an end block shows when the engine fires them.
- `log()` after a `selectElement` shows what is in the bag at that point: the fastest way to
  understand a dataflow problem at runtime.
- `log(value, "name")` labels the value in the console.

## Pitfalls

- It erases `logValue` and `logName`, nothing else: the selection survives it.
- Remove debug logging before shipping; it is noise in the presentation's console.
- For questions about the compiled structure, `eligian_compile` is faster than a `log` and a
  run.
