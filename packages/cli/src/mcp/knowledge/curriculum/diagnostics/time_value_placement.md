---
code: time_value_placement
---

**Cause:** a time with a unit (`7s`, `500ms`) is written somewhere other than the value of a program-level `const`, for example as an operation argument or in an action's `const`. **Fix:** declare it once at the top level (`const beat = 7s`, also with arithmetic: `const outro = @beat * 2 + 500ms`) and refer to it as `@beat` in times. Event times themselves (`at 2s..5s`) take units directly. Operation arguments take plain numbers in the operation's unit (milliseconds for `wait` / `animate`).
