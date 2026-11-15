---
id: what-is-eligius
title: "What Eligius is"
kind: orientation
use_cases:
  - "eligius engine"
see:
  - "what-is-eligian"
  - "config-shape"
card: "The engine Eligian compiles for: timelines, actions, operations, controllers."
---

# What Eligius is

Eligius (the npm package `eligius`, a dependency of the `eligian` CLI) is a JavaScript **story-telling engine**: it runs functionality at positions on a timeline. Typical uses are presentations, video annotations, interactive infographics and scroll-driven stories. It is not a game engine, and it is not a tweening library like GSAP: it decides *when* something happens, and the browser's CSS does most of the *how*.

Eligian is a language that compiles to Eligius. You write `.eligian` files; the compiler writes the Eligius configuration. This chunk names the Eligius concepts so the rest of the docs can use them.

## One JSON configuration

An Eligius presentation is one JSON configuration: Eligius' file format. The Eligian compiler emits these top-level properties: `engine`, `containerSelector` (always `#eligius-container`), `language`, `availableLanguages`, `layoutTemplate` (the HTML of your `layout` import), `cssFiles`, `initActions`, `actions`, `eventActions`, `timelines` and `timelineProviderSettings`, plus `id` and `$schema`. Every id is generated anew on every compile, so never compare or hand-edit ids.

Do not write or patch this JSON. The compiler emits it and `eligian_check` lints it with Eligius' own linter (`eligius/lint`). The configuration's JSON schema rejects some valid output; trust the lint, not the schema. `config-shape` lists each field and the Eligian construct that fills it.

## Timelines and position sources

A **timeline** has a `uri` (in Eligian, its name), a `type` (`animation` or `mediaplayer`), a duration and a list of **timeline actions**. Each timeline action has a range (`duration: { start, end }`, in seconds) with start operations and end operations.

A **position source** moves the timeline's position:

- `RafPositionSource` (requestAnimationFrame): the `raf` provider; an `animation` timeline;
- `ScrollPositionSource`: the `scroll` provider; the scroll offset of an element is the position;
- `VideoPositionSource`: the `video` and `audio` providers; a `mediaplayer` timeline. It appends a `<video class="eligius-video">` without controls to the container. It plays browser-playable files (MP4, WebM, MP3); it is not an HLS or DASH player.

A timeline can be played, paused, stopped and sought. A timeline action's start operations run at the start of its range and its end operations at the end; a seek ends the actions that no longer cover the new position and starts the ones that do, and a range the position jumps over runs neither.

## Actions and operations

An **action** is one or two ordered lists of **operations**: `startOperations` and `endOperations`. There are four places actions live:

- `timelines[].timelineActions`: anonymous actions with a range;
- `actions`: named actions, started on request (Eligian's action calls compile to `requestAction` + `startAction`);
- `eventActions`: named actions that run when an event is broadcast on the engine's event bus (start operations only);
- `initActions`: actions whose start operations run when the engine initialises and whose end operations run when it is torn down.

An **operation** is an atomic function such as `selectElement`, `addClass`, `setElementContent`, `broadcastEvent` or `wait`. The registry this CLI ships has the full list (`operations-index`). An operation receives one object, the **operationData**, and returns it for the next operation: one bag threaded down the list. Each operation declares what it NEEDS in the bag (for example `addClass` needs `selectedElement`), what it PROVIDES (`selectElement` provides `selectedElement`) and which properties it ERASES after use (a `selector` parameter is consumed). `eligian_operations` gives every operation's card in that order, and `map-dataflow` explains the rules.

Two consequences you must design for:

- Every block the engine fires starts from its own data: a start block and an end block are independent runs, so an end block that changes an element must select it again. `runtime-engine-lifecycle` lists what each kind of block starts with.
- A called action gets a copy of the caller's data plus its arguments, and nothing flows back to the caller.

## Controllers and the event bus

A **controller** is a stateful object attached to an element: a DOM event listener (`DOMEventListenerController`), a keyboard listener (`KeyboardController`), a text label bound to the locale files (`LabelController`), a progress bar, subtitles, and a few more. A controller stays attached until something removes it; a timeline switch does not. `controllers` lists all of them with their status.

The engine's **event bus** carries its own requests (play, pause, seek, switch timeline) and notifications. A button that plays the presentation is a listener that broadcasts a play request. An event action can listen to any bus event; `events` lists the timeline events and the arguments each carries.

## Languages

`availableLanguages` and `language` drive the label system: a `LabelController` shows the text for a key in the current language, read from the locale data. Eligian fills these from a `languages` block and a `locales` import.

## What Eligian does not expose

Eligius has features no Eligian construct emits: a timeline flow, playlists, container providers, the keyboard step source, and the `poster`, `muted` and load-timeout options of the video source. Do not plan a presentation around them; `not-eligian` gives the alternative for each.

## Where to go next

- `what-is-eligian`: the language, its files and the toolchain.
- `map-dataflow`: how the operationData bag flows, the rule everything else rests on.
- `runtime-engine-lifecycle` and `runtime-scheduling`: what the engine does at runtime, each claim tested on the installed eligius.

see: what-is-eligian, config-shape
