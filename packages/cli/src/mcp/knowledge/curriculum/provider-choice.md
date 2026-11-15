---
id: provider-choice
title: "Choosing a provider"
kind: workflow
use_cases:
  - "which provider"
see:
  - "decisions"
  - "map-timeline-and-providers"
  - "not-eligian"
card: "raf, video, audio or scroll: what drives the clock; media needs a start gesture."
---

# Choosing a provider

`using <provider>` decides what drives a timeline's position. Pick it per timeline, from the storyboard header (`storyboard`), before writing beats.

## The table

| Provider | The clock is | Choose it when | Header | Watch out |
| --- | --- | --- | --- | --- |
| `raf` | requestAnimationFrame, in seconds | nothing else is the clock: titles, decks, hubs, chapters, explainers | `using raf` | the default; a hub with no beats has duration 0 and waits for clicks |
| `video` | the video's playback position | a video file is the content and the beats annotate it | `using video from "./media/intro.mp4"` | `from` is required (`timeline-source-required`); needs a start gesture |
| `audio` | the audio's playback position | narration or music drives the beats | `using audio from "./media/narration.mp3"` | plays through a `<video>` element; needs a start gesture |
| `scroll` | the scroll position of an element | the reader's scrolling is the time (scrollytelling) | `using scroll "#scroller" duration 60s` | `duration` is required (`timeline-scroll-duration-required`); `#scroller` must scroll (`scroll_container_not_scrollable`) |

Mix providers freely: a `raf` hub that navigates to a `video` chapter is one program with two timelines. `navigate "Film"` names the timeline; the compiler turns it into the media file's path, which is the engine's uri for a media timeline.

## raf

The answer for anything a user clicks through or watches without a media file. Positions are seconds on the timeline; the timeline lasts until its last beat ends, unless `duration` is given. `loop` restarts it at the end.

## video and audio

- The media file is the clock: pausing the media pauses the beats, seeking it seeks them. Play, pause and seek with interactions: `on click "#play" toggle`, `on click "#restart" seek 0s`, `on key "space" toggle` (the `video` starter).
- Eligius creates the element itself with no native controls; there is no `muted`, `poster`, `controls` or `autoplay` option (`not-eligian`).
- Only files a browser plays directly (MP4, WebM, MP3); keep them in `media/`. A missing file is the warning `media-file-missing`; two media timelines on one file are `media-from-duplicate`.
- `eligian smoke` plays media timelines on a fake media clock (the duration is the timeline's; the file is not read, so a missing file still smokes): the walk, scenario steps and `--determinism` cover them. What the real file does (decoding, buffering, the start gesture) shows only in `eligian dev` or the VS Code preview.

## A start gesture for media

Browsers refuse to start media with sound until the user has interacted with the page, and the `--bundle` page starts the engine as soon as it loads. So a media timeline must not start on its own. Two ways:

1. **A `raf` hub first** with a Start button that navigates to the media timeline:

   ```eligian
   timeline "Start" in "#stage" using raf {
     on enter [
       selectElement("#intro")
       addClass("is-active")
       on click "#start" navigate "Film"
     ]
     on leave [
       selectElement("#intro")
       removeClass("is-active")
       selectElement("#start")
       removeControllerFromElement("DOMEventListenerController")
     ]
   }

   timeline "Film" in "#player" using video from "./media/intro.mp4" {
     at 1s..4s target "#caption" [ addClass("is-visible") ] [ removeClass("is-visible") ]
   }
   ```

2. **A visible play button in the media timeline's own `on enter`**: `on click "#play" play` or `on click "#play" toggle`, as the `video` starter does.

When the first declared timeline (the entry) is a media timeline whose `on enter` has neither `on click … play` nor `on click … toggle`, check warns `media-timeline-first-without-start-gesture`.

## scroll

The position is the scroll progress of the element after `scroll`, mapped onto `duration`. Each fact is a range that shows it while it is in view and hides it after; the `"#scroller"` element needs a fixed height and `overflow-y: auto` in CSS, and content tall enough to scroll.

## custom

`using custom` is accepted with no diagnostic and compiled as an `animation` timeline, the same type as `raf`, driven by requestAnimationFrame (`mcp-knowledge.spec.ts`, "using custom compiles silently as animation"). There is no way yet to register a position source of your own for it; how a host would supply one is the subject of a separate specification, and this table gets its row then. Until then, do not choose `custom`: choose `raf`.

see: decisions, map-timeline-and-providers, not-eligian
