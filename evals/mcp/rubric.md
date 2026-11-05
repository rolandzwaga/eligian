---
judge-model: claude-opus-5-5
---

You are judging one run of an eval of the Eligian MCP server (spec 058, roadmap §6.1 step 7). A coding
agent was asked to build an Eligian presentation, and was taught to write `STORYBOARD.md` before any
Eligian. Below are the project's `STORYBOARD.md` and its entry file. Score the run from 1 to 5 on two
things only: the quality of the storyboard, and the justification of the timeline provider. Do not
score whether the program compiles or plays: a separate gate checks that, and this score never gates.

## What a good storyboard is

The storyboard is the spec of the presentation, written in the taught template:

- a header with `audience`, `provider` (with a reason in parentheses), `languages`, `assets` and
  `host module`;
- one `## view <Timeline name> (container #<id>)` section per timeline, with `enter:` and `leave:`
  lines, where `leave` is the inverse of `enter`;
- a beat table `| timeline | start | end | selector | change | end-block |`: every beat is a range in
  seconds, the selector is an id, `change` is an operation and its argument, and `end-block` is the
  exact inverse of `change`;
- an interactions table `| trigger | target | verb | timeline |`: the trigger is `click #<id>` or
  `key <Key>`, the verb one of navigate / play / pause / toggle / stop / seek / run, and the target
  the timeline name, the time, the action call or `-` as the verb needs;
- it covers what the presentation does: the entry file implements its rows (each beat row a timed
  range on that timeline, each interaction row a listener in that view's `on enter`), and the entry
  file does nothing important that the storyboard leaves out.

## What a good provider justification is

The `provider:` line names `raf`, `video`, `audio` or `scroll`, the reason fits the content, and the
entry file's timelines use it (`using <provider>`):

- `raf` when nothing else is the clock: titles, decks, hubs, chapters, explainers;
- `video` or `audio` when a media file is the content and the beats annotate it, with a start gesture
  (a `raf` hub or a play button) because browsers refuse to start media on load;
- `scroll` when the reader's scrolling is the time, with a scroll container and a `duration`;
- mixed providers (a `raf` hub navigating to a `video` chapter) are fine when each is justified.

A reason that only restates the provider ("raf because it uses raf") is no justification.

## The scale

- **5**: the template is complete; every beat is a range with an exact inverse end-block; the
  interactions table is complete and well-formed; the storyboard and the entry file agree row for
  row; the provider is the right one and its reason says why.
- **4**: as 5 with one or two small gaps: a missing header line, an imprecise end-block, a row the
  entry file implements a little differently, or a thin but correct provider reason.
- **3**: the storyboard is usable but incomplete: several rows are missing or disagree with the
  entry file, end-blocks are missing or not inverses, or the provider is right without a reason.
- **2**: the storyboard is a sketch: it does not follow the template, most rows are missing or vague,
  or the provider does not fit the content.
- **1**: there is no storyboard, it is empty, or it describes a different presentation.

## Your answer

Write at most five short sentences of reasons, then end your answer with exactly one line of the
form `SCORE: n`, where `n` is an integer from 1 to 5, and nothing after it.
