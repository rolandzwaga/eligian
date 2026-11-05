---
controller: SubtitlesController
status: recommended
card: "Shows, in the selected element, the subtitle whose duration contains the timeline position, in the current language, and re-renders on a language change. Arguments: a fallback language code, then one collection per language, each { languageCode, titles: [{ id, duration: { start, end }, text }] } in seconds."
---

## Call

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Subtitles" in "#stage" using raf {
  on enter [
    selectElement("#title")
    addController("SubtitlesController", "en-US", [
      {
        languageCode: "en-US",
        titles: [
          { id: "t1", duration: { start: 0, end: 3 }, text: "Welcome" },
          { id: "t2", duration: { start: 3, end: 6 }, text: "Let us begin" }
        ]
      }
    ])
  ]
  on leave [
    with "#title" { removeControllerFromElement("SubtitlesController") }
  ]
}
```

## Idioms

- One collection per language of the `languages` block; the titles are matched by index across
  the languages, so every collection needs the same number of titles.
- The starting language is the locale's current language; the first argument is used only when
  nothing answers that request.

## Pitfalls

- The titles are not checked at compile time: a gap between durations shows nothing.
- Texts may hold simple markup (`<br>`, `<em>`, `<strong>`, `<span>`); scripts, images and event
  handlers are removed.
