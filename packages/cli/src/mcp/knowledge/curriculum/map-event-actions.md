---
id: map-event-actions
title: "Event actions and broadcasts"
kind: mapping
use_cases:
  - "react to an event"
  - "broadcastEvent"
  - "advance to the next timeline automatically"
see:
  - "events"
  - "map-events-and-interactions"
  - "map-timeline-and-providers"
card: "on event … action → eventActions; broadcastEvent reaches them; auto-advance recipe."
---

## Declaring an event action

```
on event "<event name>" (topic "<topic>")? action <Name>(<parameters>) [ <operations> ]
```

It is declared at the top level of a program, outside every timeline, and compiles to one entry
of `eventActions`: its name, `eventName`, `eventTopic` when given, and `startOperations`. It has
no end operations.

- **When it runs.** The engine registers every event action when it is created and keeps it until
  it is destroyed. It runs each time its event is broadcast, whichever timeline is current, and
  whether or not a timeline is playing.
- **What it starts with.** Only `eventArgs`. A parameter receives the event argument at its
  position: the first parameter compiles to `$operationData.eventArgs.0`, the second to
  `.eventArgs.1`. Select the element you need inside the event action.
- **Which events.** One of the Eligius events (the `events` chunk lists the 46 with their
  arguments), or an event the program broadcasts itself with a literal name. Anything else is
  `unknown_event_name`.
- **Topics.** With `topic "<t>"` the handler runs only for broadcasts that carry the same topic;
  without one it runs only for broadcasts without a topic.
- **Several handlers.** Every event action of the event (and topic) runs, each with its own copy
  of the arguments.
- **Names.** Event actions share one namespace with actions in Eligius: an event action named
  like an action is rejected by the engine (`check` reports it, `eligius-E001`).

## Broadcasting

```
broadcastEvent([<arguments>], "<event name>")              the argument array comes first
broadcastEvent([<arguments>], "<event name>", "<topic>")
```

A broadcast goes to the eventbus that the whole presentation shares. It reaches:

- every event action listening to that event (and topic);
- the engine and its controllers, which listen to their own events: `request-timeline-uri`
  switches timelines, `language-change` switches the language, `timeline-play-request` plays.
  `navigate`, `play` and the other interaction verbs compile to exactly these broadcasts
  (`map-events-and-interactions`).

`broadcastEvent` is an operation: put it in a block or an action, never directly after `at …`
(`operation-in-timeline-event`).

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

on event "item-shown" action markShown(selector: string) [
  selectElement(selector)
  addClass("active")
]

on event "item-shown" topic "log" action logShown(selector: string) [
  log(selector)
]

action announce(selector: string) [
  broadcastEvent([selector], "item-shown")
  broadcastEvent([selector], "item-shown", "log")
]

timeline "Intro" in "#stage" using raf {
  on enter [ with "#panel" { addClass("visible") } ]
  on leave [ with "#panel" { removeClass("visible") } ]
  at 0s..4s announce("#title")
  at 4s..5s [ broadcastEvent(["Outro", 0], "request-timeline-uri") ]
}

timeline "Outro" in "#stage" using raf {
  at 0s..3s target "#box" [ addClass("visible") ] [ removeClass("visible") ]
}
```

Read the output: `announce` holds two `broadcastEvent` operations, the second with
`eventTopic: "log"`; the parameter went into `eventArgs` as `$operationdata.selector`, which
`broadcastEvent` resolves. The last range of `Intro` is a start block that broadcasts
`request-timeline-uri` with `["Outro", 0]`. The fragment shows `actions` and `timelines` only:
`markShown` and `logShown` are entries of `eventActions`, whose `selectElement` reads
`$operationData.eventArgs.0`.

## Auto-advance

`timeline-complete` carries no arguments, so a handler cannot tell which timeline ended, and
does not know where to go. To move on when a timeline ends, give it a last range that asks the
engine to switch:

```
at <last second>..<end> [ broadcastEvent(["<target uri>", 0], "request-timeline-uri") ]
```

The uri is the target's name for a `raf` timeline and its `from` path for a `video` or `audio`
timeline (`map-timeline-and-providers` has the table). The switch ends the leaving timeline's
active actions and runs its `on leave`, as `navigate` does. A seek into that last range also
switches: put nothing after it that the viewer must see.

## Choosing

- A user gesture on an element or a key: an interaction (`on click …`, `on key …`).
- A reaction to the engine (`timeline-complete`, `language-change`) or to your own broadcast:
  an event action.
- One action telling unrelated parts of the presentation that something happened: a broadcast
  with your own event name, and one event action per listener.
- Calling one known action from another: a plain call, not a broadcast. A called action starts
  with the caller's data plus its arguments; a handler starts with only `eventArgs`.
