# Feature Specification: Interaction Statements

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-11-01
**Status**: Implemented (without `on key`, see Open)
**Input**: Feature idea #19 of the 2026-10-22 codebase audit.

## Problem

`on click "<sel>" navigate "<tl>" (at t)?` was the only interaction. Play and pause buttons,
seek-to-label buttons and hover effects needed a hand-written
`addController("DOMEventListenerController", …)` plus a broadcastEvent action, although the engine
already handles timeline play, pause, toggle, seek and stop requests
(`engine-eventbus-adapter.ts`).

## Syntax

```
InteractionStatement:
    'on' event=Identifier selector=STRING (
        verb='navigate' target=STRING ('at' position=TimeExpression)?
      | verb=('play' | 'pause' | 'toggle' | 'stop')
      | verb='seek' position=TimeExpression
      | verb='run' call=OperationCall
    );
```

`NavigateStatement` is renamed `InteractionStatement`; `click` is no longer a keyword (an event
name is an Identifier). The verbs are contextual keywords: they are in `Identifier` and in the new
`ActionName` rule (action names, calls and action imports), so an action can still be called
`toggle` or `play`.

## Compilation

Every verb compiles at the call site to `selectElement(sel)` +
`getControllerInstance("DOMEventListenerController")` +
`addControllerToElement({ eventName, actions: [name] (, actionOperationData) })`.

| Verb | Listener action | Broadcast |
|---|---|---|
| `navigate "T" at p` | `__nav__<slug>_<hash>(__<p>)` (unchanged) | `request-timeline-uri` [uri, p] |
| `play` / `pause` / `toggle` / `stop` | `__on__<verb>` | `timeline-play-request` / `timeline-pause-request` / `timeline-play-toggle-request` / `timeline-stop-request` [] |
| `seek p` | `__on__seek__<p>` | `timeline-seek-request` [p] |
| `run a(args)` | `a` (its library-qualified name) | none: `actionOperationData` = `{ param: arg }` |

The synthetic actions are emitted once per name by `transformAST`, from the program's interaction
statements and those of the library actions it reaches.

## Positions

Constant time expressions. `seek` resolves labels (`intro.end`) of the timeline it is in, and
`navigate` those of the target timeline (scope provider, `labelTimeline`), in any order: the
position is not one of that timeline's times, so the earlier-events rule does not apply. Label
times come from the shared resolver (`resolveTimelineTimes`); a label whose time is not known at
compile time is an error (`event_label_time_unknown`).

## Validation

- `unknown_dom_event` (warning): the event is not in `utils/dom-events.ts`, with suggestions.
- `run_not_an_action`: `run` of an operation.
- `run_runtime_argument`: an argument holds a parameter, a loop item (`@@…`), a property chain or a
  constant holding one (the listener stores the arguments when it is attached).
- `missing-action-dependency` (dataflow): the `run` action needs a property (such as
  `selectedElement`) that DOMEventListenerController does not provide (only `eventTarget` and the
  arguments).
- Unchanged: unknown navigate target, selector checks against the CSS and layout.

## Editor

Completion offers the DOM events after `on` and the verbs after the selector; the verbs are
highlighted as keywords (except as a call, `toggle(…)`); the formatter spaces them.

## Open

- `on key "<Key>" <verb>`: DOMEventListenerController passes only `eventTarget` to its actions, so
  a listener cannot filter on the key, and a document-level listener needs an element. This needs
  an Eligius change (a key filter on the controller, or a hotkey controller like the
  EngineInputAdapter's hotkeys-js toggle).
- `next` / `prev` (to the next or previous label).
