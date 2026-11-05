---
operation: compareDate
card: "Compares two dates: compareDate(date1, date2), each a date string, a timestamp or a Date. Provides comparison (-1 before, 0 equal, 1 after, for date1 against date2) and the booleans isEqual, isBefore, isAfter, for an if condition."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action markIfLate(deadline: string) [
  getCurrentTime()
  compareDate($operationdata.date, deadline)
  if ($operationdata.isAfter) {
    selectElement("#box")
    addClass("highlight")
  }
]

timeline "main" in "#stage" using raf {
  at 0s..3s [
    markIfLate("2026-12-31")
  ] [
    selectElement("#box")
    removeClass("highlight")
  ]
}
```

## Idioms

- Today against a fixed date: `getCurrentTime()` (provides `date` and `timestamp`), then
  `compareDate($operationdata.date, "<YYYY-MM-DD>")`.
- Branch with `if ($operationdata.isBefore) { … } else { … }`.

## Pitfalls

- Strings are parsed with `new Date(…)`: write ISO dates (`"2026-06-01"`); an unparsable date
  throws at runtime (`compareDate: invalid date`), as does a missing or empty one.
- The result describes `date1`: swapping the arguments turns `isBefore` into `isAfter`.
