---
controller: RoutingController
status: do-not-use
card: "Do not use: its own metadata says it is a work in progress. For buttons and keys that switch timelines use the navigate interactions (on click \"<sel>\" navigate \"<timeline>\"); for a menu use NavigationController with timelineUri entries."
---

## Instead

- `on click "#next" navigate "Chapter 2"` (and `on key "right" navigate …`) switches timelines,
  optionally `at` a position; see `map-events-and-interactions`.
- A menu of chapters: `NavigationController`, with a `timelineUri` on every entry.

## Call

The call still compiles; it takes the same `json` as NavigationController and syncs the
browser history (`#/<id>/<position>` URLs) with it:

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Routes" in "#stage" using raf {
  on enter [
    selectElement("#stage")
    addController("RoutingController", {
      navigationData: [{ id: "intro", labelId: "nav.intro", videoUrlIndex: 0, timelineUri: "Routes" }],
      roots: ["intro"]
    })
  ]
  on leave [
    with "#stage" { removeControllerFromElement("RoutingController") }
  ]
}
```

## Pitfalls

- Its behaviour may change in any Eligius release; nothing in Eligian tests it.
- An entry without a `timelineUri` sends the legacy `request-video-url`, which the engine does
  not handle.
