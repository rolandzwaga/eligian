---
id: verification-ladder
title: "Verification ladder"
kind: workflow
use_cases:
  - "verify a presentation"
see:
  - "storyboard"
  - "diagnostics"
  - "presentation-patterns"
card: "check, review warnings, fmt, smoke with scenarios, determinism, then dev: each rung clean before the next."
---

# Verification ladder

Climb it in order after every change, and do not declare a presentation done until every rung is clean. Each rung catches what the one below cannot; the last three are smoke with scenarios → determinism → `dev`.

## 1. check: 0 errors

`eligian_check({ paths: ["main.eligian"] })` (CLI: `npx eligian check main.eligian --max-warnings 0`) parses, validates, type-checks and compiles the program, runs Eligius' configuration lint over the result, then the review pass. Run it after **every** edit. Each diagnostic carries its code, the source excerpt and the fix (`suggestions`, a `quickFix`, the overlay text); `diagnostics` lists every code. Fix errors first: the review pass only runs on a program that compiles.

The tool's defaults are the strict ones: `lint: true`, `review: true`, `selectorNotInLayout: 'ids'`, `maxWarnings: 0`. Do not turn them off to get to green.

## 2. Review warnings: 0 warnings

Warnings are not optional here: the review pass reports, in the compiled program, the mistakes that compile but misbehave at runtime:

- `controller-imbalance`: an `on enter` adds controllers its `on leave` does not remove (each `on click` / `on key` adds one);
- `class-never-removed`: an `addClass` that no end block, later range or `on leave` removes;
- `media-file-missing`, `media-from-duplicate`, `timeline-container-not-in-layout`, `media-timeline-first-without-start-gesture`, `entry-timeline-without-enter`: the timelines against the files and the layout;
- `host-operation-in-block-without-select` and `lottie-web-not-installed`: host operations and LottieController.

Besides these, `selector_not_in_layout` (an id in the CSS but not in the layout) is a warning, and Eligius lint findings (`eligius-<rule>`) count as well. Reach 0 / 0.

## 3. fmt

Once check is clean: `eligian_fmt({ paths: ["main.eligian"], write: true })` (CLI: `npx eligian fmt --write main.eligian`; `--check` lists unformatted files). It changes whitespace only, so check stays clean.

## 4. smoke with scenarios

`eligian_smoke({ paths: ["main.eligian"], scenario })` (CLI: `npx eligian smoke main.eligian --scenario scenario.json`) compiles the program and plays every timeline on the real Eligius engine in jsdom: it seeks to each event boundary and reports runtime problems at their source (`smoke-engine-error`, `smoke-console-error`, `smoke-selector-miss` for a `selectElement` that matches nothing, `host-operation-returned-non-object`, …). Then it replays the scenario on a fresh engine and checks its assertions.

Write **one scenario step per interaction** you wired (every `on click`, `on key`, labelled seek) and assert what the storyboard says it does. For the `chapters` starter:

```json
{
  "steps": [
    { "seek": 0 },
    { "click": "#card-1" },
    { "snapshot": "chapter" },
    { "key": "ArrowRight" },
    { "snapshot": "second" },
    { "key": "Escape" },
    { "snapshot": "hub" }
  ],
  "assertions": [
    { "after": "chapter", "timeline": "Chapter 1" },
    { "after": "second", "selector": "#c1-beat-2", "hasClass": "is-visible" },
    { "after": "second", "position": 4 },
    { "after": "hub", "timeline": "Hub" },
    { "after": "hub", "selector": "#back-1", "controllers": [] }
  ]
}
```

Steps: `seek` (seconds), `click`, `key` (with an optional `in`), `navigate` (a timeline name), `wait` (milliseconds) and `snapshot` (a label). Each step returns the active timeline, the position and a snapshot of every layout id (classes, text, visibility, controllers). Assertions name a snapshot label or step index in `after` and check `hasClass`, `notHasClass`, `text`, `visible`, `controllers`, `timeline` or `position` (seconds, `{ "sameAs": <step> }` or `{ "greaterThan": <step> }`); a failed one is `scenario-assertion-failed` with the expected and actual values. Asserting `controllers: []` after leaving a view proves its `on leave` unwired it.

Limits: a scenario applies to one program file; `timelines: ["Hub"]` (CLI `--timeline Hub`) narrows the walk of a long presentation, and `timeoutMs` stops it with `partial: true`.

Video and audio timelines are walked too, on a media clock: smoke gives jsdom's media elements a fake clock whose duration is the compiled timeline's, so the walk visits their boundaries, a scenario `seek` moves them and a `wait` while one plays advances it in real time. The clock has three limits. It models positions only: `currentTime`, `duration` and the play, pause and seek events, no frames and no sound. There is no decoding: the media file is never read, so a missing or broken file still smokes (`check` reports a missing one as `media-file-missing`). There is no autoplay policy: `play()` always succeeds, where a browser may refuse it without a user gesture (`media-timeline-first-without-start-gesture`). Those three are verified in `dev`.

## 5. determinism

`determinism:true` on the tool, `--determinism` on the CLI: `eligian_smoke({ paths: ["main.eligian"], determinism: true })` (CLI: `npx eligian smoke main.eligian --determinism`). Smoke then plays every timeline, media included, on three fresh engines and compares, at every event boundary, the classes, text, style and visibility of every layout id reached three ways: linear play through the boundaries, a seek straight to the position, and a seek to the end and back. A viewer who scrubs, seeks to a label or comes back from a later chapter must see what linear play shows. Each difference is a `position-nondeterministic` error with the timeline, the position, the element, the property (for classes, the class name) and the three values, located at the range that selects the element.

The usual cause is a start block that changes the DOM and an end block that does not undo it: an `addClass` with no `removeClass`, a `setElementContent` that nothing restores. Give the range an inverse end block, or move the change to `on enter` / `on leave`, and smoke again. It combines with a scenario, `strict` and `timelines`; it is about three times slower than a plain smoke, so pass `timelines` on a long presentation.

## 6. dev: look at it

`npx eligian dev main.eligian` (`--port`, default 5180, `--open` to open the browser) serves the bundle and rebuilds it when a file changes: CSS is swapped in place, any other change reloads the page at the same timeline and position, and a build error shows as an overlay. It is a long-running process: start it for the user or tell them to run it; it is not an MCP tool.

Runtime errors appear in the browser console. An agent with a browser tool can open the page and drive the engine there:

```js
const engine = await window.EligiusBundled.ready;
await engine.seek(5);
engine.pause();
[engine.currentTimelineUri, engine.position];
```

`engine.switchTimeline("<uri>", 0)` switches timelines (the uri is the timeline name, or the `from` path of a media timeline). Real media playback (decoding, the browser's autoplay policy, the start gesture) is verified here, not in smoke.

In VS Code, *Eligian: Preview Timeline* plays the presentation beside the editor; an engine error becomes an `eligius-runtime` diagnostic on the operation that failed.

## Before declaring done

Compare `STORYBOARD.md` with `eligian_project`'s `storyboard` section (beat rows per timeline against the compiled ranges), and with `eligian_compile` (`select: { timeline: "<name>" }`) when a beat does not behave as planned.

see: storyboard, diagnostics, presentation-patterns
