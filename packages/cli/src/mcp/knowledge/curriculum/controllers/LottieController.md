---
controller: LottieController
status: constrained
card: "Plays a lottie-web animation in the selected element. Constrained: install lottie-web in the project (check warns lottie-web-not-installed until it resolves); load the animation with loadJson first (the controller needs the JSON, not a url); a local relative url such as ./anim.json travels with --bundle and dev; smoke cannot play it (lottie-web needs a canvas jsdom lacks)."
---

## Call

Install `lottie-web` in the project first (`npm install lottie-web`, or `pnpm add lottie-web`).
Load the animation JSON with `loadJson` (it lands in `json` on the operation data), then attach
the controller to the selected element:

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Animation" in "#stage" using raf {
  on enter [
    selectElement("#box")
    loadJson("./anim.json")
    addController("LottieController")
  ]
  on leave [
    with "#box" { removeControllerFromElement("LottieController") }
  ]
}
```

## Idioms

- `addController("LottieController", "./anim[freeze=10,end=21].json")`: the url argument
  is read only for its `[freeze=<frame>,end=<frame>]` markers; the animation itself still comes
  from `loadJson`.
- Eligius loads `lottie-web` with a dynamic `import()` the first time a LottieController
  attaches, so programs that never use it do not need the package.

## Pitfalls

- `addController("LottieController", "./anim.json")` without `loadJson` fails at runtime with
  "LottieController: provide the animation as 'json' or 'animationData'": the controller does not
  fetch the url.
- Status `constrained`: it works only where `lottie-web` resolves from the project's own
  `node_modules` (resolved upward from the program's directory). `check` reports
  `lottie-web-not-installed` at the call until it does; the fix is the install above, not a
  CLI flag. Without the package the attach fails at runtime with "LottieController requires the
  optional peer dependency 'lottie-web'".
- `loadJson` fetches at runtime. A local, relative url (`./anim.json`) travels with the program:
  `compile --bundle` copies the file into the bundle and rewrites the url to it, and `eligian dev`
  serves it. An `http(s):`, `data:` or `/`-rooted url is left as it is and must be reachable
  where the presentation runs.
- `eligian smoke` cannot play it (a known limit, not a defect of the program): `lottie-web` fails
  at import under smoke's jsdom (no canvas), and Eligius reports it as a missing peer dependency
  ("LottieController requires the optional peer dependency 'lottie-web'") even when the package
  is installed. Expect a `smoke-engine-error` on the attach (an error: smoke exits 1 for a
  Lottie program); verify Lottie in a browser (`dev`).
- Remove it in `on leave` like any controller.
