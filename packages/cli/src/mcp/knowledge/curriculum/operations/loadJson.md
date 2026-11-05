---
operation: loadJson
card: "Fetches a JSON file at runtime: loadJson(url, cache?); the parsed value lands in json. Use it for data files and for a LottieController animation, which reads json, not a url. A local relative url such as ./anim.json travels with compile --bundle and dev. cache: true reuses the first fetch of the same url."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using raf {
  on enter [
    selectElement("#box")
    loadJson("./anim.json", true)
    addController("LottieController")
  ]
  on leave [
    selectElement("#box")
    removeControllerFromElement("LottieController")
  ]
  at 0s..3s [
    loadJson("./anim.json", true)
    selectElement("#title")
    setElementContent($operationdata.json.nm)
  ] [
    selectElement("#title")
    setElementContent("")
  ]
}
```

## Idioms

- `loadJson("./anim.json")` right before `addController("LottieController")`: the controller
  takes the animation from `json`. It also needs `lottie-web` installed in the project
  (`check` warns `lottie-web-not-installed` until it is; see `LottieController`).
- Read fields with chains (`$operationdata.json.nm`); the compiler moves a chain into a
  `setOperationData` where the operation does not resolve it.
- `cache: true` when the same file is loaded on every visit of a timeline.

## Pitfalls

- At runtime the url resolves against the page, not against the `.eligian` file. Only a local,
  relative url is copied by `--bundle` (and served by `dev`); `http(s):`, `data:`, `//` and
  `/`-rooted urls are fetched as written.
- A failed fetch, a non-2xx status or invalid JSON throws; the rest of the list does not run.
- It erases `url` and `cache`; `json` stays until it is overwritten.
