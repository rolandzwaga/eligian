---
operation: formatDate
card: "Formats date (a Date, a date string or a timestamp) into formattedDate with the tokens YYYY, MM, DD, HH, mm and ss, in the viewer's local time zone; other characters stay. The date comes from getCurrentTime or setOperationData; show the result with setElementContent($operationdata.formattedDate)."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  at 0s..2s [
    getCurrentTime()
    formatDate("DD/MM/YYYY HH:mm")
    selectElement("#title")
    setElementContent($operationdata.formattedDate)
  ] [
    selectElement("#title")
    setElementContent("")
  ]
  at 2s..4s [
    setOperationData({ date: "2024-01-05T14:05:00" })
    formatDate("YYYY-MM-DD")
    selectElement("#box")
    setElementContent($operationdata.formattedDate)
  ] [
    selectElement("#box")
    setElementContent("")
  ]
}
```

## Idioms

- Now: `getCurrentTime()` (it provides `date` and `timestamp`), then `formatDate(…)`.
- A fixed date: `setOperationData({ date: "2024-01-05T14:05:00" })`.
- One pattern for every range: a constant (`formatDate(@dateFormat)`).

## Pitfalls

- It needs `date`: without `getCurrentTime` or a `setOperationData` before it, `check`
  reports the missing dependency; a missing or invalid date throws at runtime.
- Tokens are case-sensitive: `MM` is the month, `mm` the minutes.
- No month names, weekdays or 12-hour clock: compose those in a host function.
- `getCurrentTime` reads the real clock: the text differs on every run and for every viewer.
