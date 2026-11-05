---
operation: saveToStorage
card: "Stores a JSON copy of a value in browser storage: saveToStorage(key, value, storageType), storageType 'local' (kept across visits) or 'session' (this tab). check requires all three arguments. loadFromStorage(key, storageType) reads it back into loadedValue. Fits progress, preferences and seen-it flags."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action remember(chapter: number) [
  saveToStorage("progress", { chapter: chapter, seen: true }, "local")
]

action resume [
  loadFromStorage("progress", "local")
  setGlobalData(["loadedValue"])
]

timeline "main" in "#stage" using raf {
  on enter [
    resume()
    on click "#next" run remember(2)
  ]
  on leave [
    with "#next" { removeControllerFromElement("DOMEventListenerController") }
  ]
}
```

## Idioms

- Save from a click or key handler (`on click "#next" run remember(2)`), load in `on enter`.
- One key per concern (`"progress"`, `"settings"`) with an object as the value.
- An action parameter inside the value (`{ chapter: chapter }`) is resolved: the compiler moves
  the object into a `setOperationData` before the call.

## Pitfalls

- An empty `key`, a `value` that is undefined (a property that was never set) or a
  `storageType` other than `local` / `session` throws at runtime.
- The value is stored as JSON: functions, DOM elements and controllers do not survive.
- `local` storage outlives the presentation: a reload or a replay starts with what the last
  visit saved. Do not drive what a range shows from it without a reset.
