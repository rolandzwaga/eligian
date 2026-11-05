---
operation: loadFromStorage
card: "Reads a JSON value from browser storage: loadFromStorage(key, storageType), storageType 'local' or 'session' (check requires both arguments). The parsed value lands in loadedValue; a key that was never saved gives null. saveToStorage writes what it reads."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action resume [
  loadFromStorage("progress", "local")
  if ($operationdata.loadedValue != null) {
    log($operationdata.loadedValue, "progress")
    selectElement("#title")
    addClass("visible")
  }
]

timeline "main" in "#stage" using raf {
  on enter [
    resume()
  ]
  on leave [
    selectElement("#title")
    removeClass("visible")
  ]
}
```

## Idioms

- Branch on `$operationdata.loadedValue != null` to tell "nothing saved yet" from a value.
- Read with the key and storage type that `saveToStorage` wrote with; `"session"` lasts for the
  browser tab only.
- Restore state in `on enter`, before the first range runs; `setGlobalData(["loadedValue"])`
  keeps it for the other actions.

## Pitfalls

- Eligian requires the second argument: `loadFromStorage("progress")` is a `parameter_count`
  error, although Eligius itself would default to `"local"`.
- A stored value that is not JSON (written by other code) throws at runtime; so does an empty
  key.
- It erases `key` and `storageType`; `loadedValue` stays until it is overwritten.
