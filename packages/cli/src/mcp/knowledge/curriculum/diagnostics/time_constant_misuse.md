---
code: time_constant_misuse
---

**Cause:** a time constant (`const beat = 7s`, used as `@beat`) appears outside a time: as an operation argument, in a condition or in a non-time constant. A time constant holds seconds for the timeline and has no meaning anywhere else. **Fix:** use it only in times (`at @beat for 2s`, `for @beat`, `sequence` and `stagger` times, the timeline `duration`) or in another program-level constant's value. For an operation argument, pass a plain number in that operation's own unit (milliseconds for `wait` / `animate` durations), or declare a separate number constant.
