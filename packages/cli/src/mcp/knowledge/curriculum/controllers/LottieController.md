---
controller: LottieController
status: constrained
card: "Plays a lottie-web animation in the selected element. Constrained: install lottie-web in the project (check warns lottie-web-not-installed until it resolves); load the animation with loadJson first (the controller needs the JSON, not a url); serve the JSON file yourself (--bundle and dev do not copy it); smoke cannot play it (lottie-web needs a canvas jsdom lacks)."
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
    loadJson("./animations/intro.json")
    addController("LottieController")
  ]
  on leave [
    with "#box" { removeControllerFromElement("LottieController") }
  ]
}
```

## Idioms

- `addController("LottieController", "./animations/intro[freeze=10,end=21].json")`: the url argument
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
- `loadJson` fetches at runtime: `compile --bundle` does not copy the JSON file next to the
  bundle and `eligian dev` serves only its build output, so copy the file beside `index.html`
  yourself (or inline it as a `data:application/json;base64,…` url).
- `eligian smoke` cannot play it: under jsdom `lottie-web` fails at import (no canvas), and the
  engine reports it as the missing peer dependency. Expect a `smoke-engine-error` on the attach;
  verify Lottie in a browser (`dev`).
- Remove it in `on leave` like any controller.
