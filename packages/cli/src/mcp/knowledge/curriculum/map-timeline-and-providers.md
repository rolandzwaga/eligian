---
id: map-timeline-and-providers
title: "Timelines and providers"
kind: mapping
use_cases:
  - "declare a timeline"
see:
  - "decisions"
  - "runtime-scheduling"
card: "timeline … using <provider>: ranges, on enter / on leave, entry timeline."
---

## The declaration

```
timeline "<name>" in "<container selector>" using <provider> ["<scroll selector>"]
  [from "<media path>"] [loop] [duration <time>] { ... }
```

The options come in this order. `<container selector>` is the element the timeline's content
lives in; it must exist in the layout.

| Provider | Eligius `type` | Engine `uri` | Notes |
| --- | --- | --- | --- |
| `raf` | `animation` | the name | clock-driven; the default choice |
| `video` | `mediaplayer` | the `from` path | `from` is required |
| `audio` | `mediaplayer` | the `from` path | also plays through a `<video>` element |
| `scroll` | `animation` | the name unless `from` is given | scroll progress of the element drives the position; `duration` is required |
| `custom` | `animation` | the name unless `from` is given | accepted, compiled like `raf`; see `not-eligian` |

The `uri` matters for navigation: `navigate "<name>"` broadcasts the target timeline's uri, so
a media timeline is reached through its `from` path. The compiler fills this in for you.

## Events become timeline actions

- `at 2s..5s [ start ] [ end ]` (or `at 2s for 3s`) becomes a timeline action with
  `duration: { start: 2, end: 5 }`; the start list runs when the position enters the range, the
  end list when it leaves.
- `at +1s for 2s` starts one second after the previous event ends.
- `at ... as intro` labels an event: later times may use `intro.start` / `intro.end`.
- `sequence { ... }` and `stagger ...` expand to plain ranges.
- Times are seconds; operation arguments such as `wait` / `animate` durations are milliseconds.
- Without `duration`, the timeline lasts until the end of its last event.

## on enter / on leave

`on enter [ ... ]` runs when the timeline becomes active (the first timeline at start, any other
when navigated to); `on leave [ ... ]` runs when it is left by a navigation, a stop or engine
teardown, **not** when its content ends. Together they compile to one timeline action named
`timeline-lifecycle` with `duration: { start: 0 }` and no end. It does not count towards the
duration: a timeline with only lifecycle blocks has duration 0 and waits for interactions.
Show the timeline's view in `on enter`, attach its listeners there, and undo both in `on leave`.

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

timeline "Hub" in "#stage" using raf {
  on enter [
    selectElement("#panel")
    addClass("visible")
  ]
  on leave [
    selectElement("#panel")
    removeClass("visible")
  ]
  at 0s..2s target "#title" [ addClass("visible") ] [ removeClass("visible") ]
  at +1s for 2s target "#box" [ addClass("active") ] [ removeClass("active") ]
}

timeline "Film" in "#stage" using video from "./media/intro.mp4" {
  at 0s..4s target "#title" [ addClass("highlight") ] [ removeClass("highlight") ]
}
```

Read the output: `Hub` is keyed by its name with `type: animation` and duration 5 (the
lifecycle action is not counted; `+1s` put the second range at 3..5). The video timeline is
keyed by `./media/intro.mp4` with `type: mediaplayer`.

## Media timelines

- Eligius creates the `<video>` element inside the container itself, with `controls` and
  `autoplay` off; there are no native controls, so playback is driven by the timeline,
  interactions (`on click "#play" play`) or key listeners.
- Only files the browser can play directly; there is no HLS or DASH.
- Browsers may refuse to start media without a user gesture (`NotAllowedError`), and the
  bundled runtime starts the engine on page load. A media-first presentation therefore opens on
  a `raf` hub with a Start button that navigates to the media timeline.
- Several timelines may share one container; the first declared timeline is the entry
  timeline.
