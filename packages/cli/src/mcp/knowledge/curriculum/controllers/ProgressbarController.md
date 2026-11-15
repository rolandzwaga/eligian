---
controller: ProgressbarController
status: recommended
card: "Sets the width of the selected element to the timeline's progress (0-100%), and seeks when the user clicks its parent. Select the fill element, not the track. It follows pause, seek and timeline switches; it takes no arguments."
---

## Call

The layout has a track with a fill inside it; the controller goes on the fill:

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Progress" in "#stage" using raf {
  on enter [
    selectElement("#box")
    addController("ProgressbarController")
  ]
  on leave [
    with "#box" { removeControllerFromElement("ProgressbarController") }
  ]
}
```

## Idioms

- Attach it in `on enter` of each timeline (or in a shared enter action) and remove it in
  `on leave`: the bar then follows whichever timeline runs.
- A click on the fill's parent seeks to that fraction of the duration; the fill itself ignores
  pointer events while attached.

## Pitfalls

- Its metadata also lists a `textElement` for a percentage text; Eligian has no argument for it,
  so the percentage text is not rendered. Show a number with your own operations if you need it.
- Selecting the track instead of the fill makes the whole track grow.
