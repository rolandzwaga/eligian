---
operation: clearStorage
card: "Removes browser storage: clearStorage(storageType, key?) with storageType \"local\" or \"session\". With a key it removes that key only; without one it clears the whole storage. Pairs with saveToStorage and loadFromStorage."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action restart [
  clearStorage("local", "progress")
  broadcastEvent([0], "timeline-seek-request")
]

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#next")
    addController("DOMEventListenerController", "click", ["restart"])
  ]
  on leave [
    selectElement("#next")
    removeControllerFromElement("DOMEventListenerController")
  ]
}
```

## Idioms

- Reset saved progress from a button: a handler action with `clearStorage("local", "<key>")`.
- `"session"` storage ends with the browser tab; `"local"` survives reloads.

## Pitfalls

- Without a key it wipes everything the origin stored, not only this presentation's keys:
  pass the key.
- A key that is present but empty, blank or not a string throws at runtime instead of
  clearing everything; `check` does not catch an empty string.
- `eligian smoke` plays in jsdom without browser storage: a played `clearStorage` fails there
  with `localStorage is not defined` (`sessionStorage …` for `"session"`).
