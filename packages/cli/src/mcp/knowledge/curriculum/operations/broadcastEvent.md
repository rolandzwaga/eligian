---
operation: broadcastEvent
card: "Puts an event on the engine's bus: broadcastEvent(eventArgs, eventName, eventTopic?), the arguments array first. on event actions, controllers and the engine itself listen; it cannot reach a request responder."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

on event "box-ping" action onBoxPing(target) [
  selectElement(target)
  addClass("active")
]

timeline "main" in "#stage" using raf {
  at 0s..2s [
    broadcastEvent(["#box"], "box-ping")
  ] [
    selectElement("#box")
    removeClass("active")
  ]
  at 2s..4s [
    broadcastEvent([0], "timeline-seek-request")
  ]
}
```

## Idioms

- Your own events: `broadcastEvent([<args>], "<name>")` plus an `on event "<name>" action …`
  whose parameters receive the arguments in order.
- Engine events steer the presentation: `timeline-seek-request` with `[<seconds>]`,
  `language-change` with `["nl-NL"]`. The `events` chunk lists them with their arguments.
- For navigation and playback from a click or a key, an interaction
  (`on click "#next" navigate "chapter2"`, `play`, `seek 0s`) writes the listener and the
  broadcast for you.

## Pitfalls

- The order is `(eventArgs, eventName)`: the array comes first, even when it is `[]`.
- `eventArgs` is an array; a single value goes in brackets: `["#box"]`.
- A topic (`eventTopic`) only reaches listeners registered for that topic.
- It needs no selection and provides nothing; the event's handlers run with their own data.
