---
operation: getCurrentTime
card: "Reads the wall clock: puts timestamp (milliseconds since 1970) and date (a Date) in the operation data. No parameters. It is not the timeline position. Pair it with formatDate, which reads date."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..3s [
    getCurrentTime()
    formatDate("HH:mm")
    selectElement("#title")
    setElementContent($operationdata.formattedDate)
  ] [
    selectElement("#title")
    setElementContent("")
  ]
}
```

## Idioms

- `getCurrentTime()` then `formatDate("<pattern>")`: `formatDate` needs `date`, which this
  operation provides; the result is `formattedDate`.
- `$operationdata.timestamp` with `calc` for elapsed-time arithmetic (`calc` resolves chains).

## Pitfalls

- It reads the computer's clock when the block runs, so the result differs between runs and
  after a seek: content that must look the same on every run should not depend on it.
- For the playhead, use the timeline (ranges, labels), not this.
- `timestamp` and `date` stay in the bag until overwritten; a second call overwrites both.
