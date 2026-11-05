---
controller: NavigationController
status: recommended
card: "Renders a navigation menu in the selected element from a json of entries and roots, highlights the active entry, and switches timelines on activation. Give every entry a timelineUri (a raf timeline's name); without one it broadcasts request-video-url, which the engine does not handle."
---

## Call

The `json` is one object: `navigationData` (the entries) and `roots` (the ids of the top-level
entries). Each entry has an `id`, a `labelId` (a key of the locales file), a `videoUrlIndex`
and, for the engine to switch timelines, a `timelineUri`:

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Menu" in "#stage" using raf {
  on enter [
    selectElement("#panel")
    addController("NavigationController", {
      navigationData: [
        { id: "intro", labelId: "nav.intro", videoUrlIndex: 0, timelineUri: "Menu" },
        { id: "outro", labelId: "nav.outro", videoUrlIndex: 1, timelineUri: "Outro" }
      ],
      roots: ["intro", "outro"]
    })
  ]
  on leave [
    with "#panel" { removeControllerFromElement("NavigationController") }
  ]
}

timeline "Outro" in "#stage" using raf {
  on enter [ with "#box" { addClass("active") } ]
  on leave [ with "#box" { removeClass("active") } ]
}
```

## Idioms

- The `timelineUri` of a `raf` timeline is its name; of a media timeline, its source.
- `autoNext: true` on an entry starts the next entry when its timeline completes; `nextId` and
  `children` (ids) shape the order and the tree.
- For a few buttons, the `on click "<sel>" navigate "<timeline>"` interaction is simpler.

## Pitfalls

- The json is not checked at compile time: a missing `navigationData` array or an unknown id in
  `roots`, `nextId` or `children` throws when the controller is initialised.
- The menu's labels need the `locales` import that holds every `labelId`.
