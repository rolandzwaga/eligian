---
id: interview
title: "The brief interview"
kind: workflow
use_cases:
  - "new presentation"
  - "addition to a presentation"
see:
  - "brief-questions"
  - "decisions"
  - "provider-choice"
  - "presentation-patterns"
  - "css-conventions"
  - "storyboard"
card: "Interview the user with eligian_brief before any file: rounds, recommendations, facts you look up, delegated answers, the sign-offs."
---

# The brief interview: settle every decision before any file

A presentation starts with the brief, not with code. `eligian_brief` owns the question tree and records every answer in `BRIEF.md` beside the program; `eligian_check`, `eligian_fmt`, `eligian_compile`, `eligian_smoke` and `eligian_init` refuse until the brief is approved. You ask, the user decides, the tool records. Never write `BRIEF.md` yourself: only the tool writes it, and a line you type in does not count as a sign-off.

Start with `eligian_brief` and `action: status`, passing the user's idea verbatim as `idea`. For an addition to an existing presentation (a new view, a new language, a first host module) pass `scope: { addition, name }`; the round is then the short interview of that addition only.

## Rounds

Each reply holds a `round`: at most 7 questions whose prerequisites are settled. Put the whole round in one message, one numbered item per question:

- its `title`, in the user's words where the `ask` text helps;
- your recommended answer, worded so that "yes" accepts it ("Two views, Intro then Details: yes?");
- the doc the recommendation came from, by id.

Then call `eligian_brief` with `action: answer` and `answers: [{ id, value, delegated? }]`, each `value` in the item's `shape`. What the user volunteered earlier (in the idea or a previous reply) can be recorded at once, in the same call, without asking again. A rejected answer comes back in `rejected` with its reason; the accepted ones stand. Ask again only for the rejected ones.

## Recommendations

Every question carries `docs`: the ids to read before you recommend. The usual sources:

- `decisions`: the default architectures, one timeline per view, where state lives.
- `provider-choice`: what drives each view's time (`raf`, `video`, `audio`, `scroll`) and the start gesture media needs.
- `presentation-patterns`: hub and chapters, keyboard deck, auto-advance, next and previous, progress, language toggle.
- `css-conventions`: hidden by default, `is-` state classes with transitions, motion.

A recommendation names a concrete value, never "it depends". When two answers are equally good, recommend the simpler one and say what the other would buy.

## Facts, not questions

Each question also carries `facts`: what to look up before asking. Facts are never put to the user:

- What the project already contains: layout ids, CSS classes and custom properties, locale keys, asset files, host module declarations (`eligian_project`).
- Whether a named asset file exists (look at the file system).
- The text direction of each language (from its language code).
- The installed `eligian` version and the package manager.

When a fact settles an answer, record it and tell the user what you found instead of asking.

## "You decide"

"You decide" is a valid answer. Record your choice as the `value` with `delegated: true`. The reply's counts include the delegated answers, and the sign-off lists every one of them with your choice, so the user sees what was decided for them. A view that is like another one takes that view's whole branch with one answer: id `V:<view>`, value `same as <other view>`.

## The sign-offs

When `state` is `complete`, call `eligian_brief` with `action: confirm`. With a client that shows dialogs, the server asks the user directly: the counts, the delegated answers with your choices and the `BRIEF.md` path, and one checkbox.

- Accepted: the brief is `confirmed`.
- Declined: the brief stays `complete`. Ask the user what to change, record it with `action: answer`, then confirm again.
- No dialog: the client has no elicitation, or no one answered the dialog (the reply then carries a `summary` and a `ticket`). Show the user the counts, the delegated answers and the `BRIEF.md` path (the `summary` when there is one), then call the same action again with their reply verbatim as `confirmation`, plus the `ticket` when one was returned. Never paraphrase the reply and never send a confirmation the user did not give.

After confirmation, draft `STORYBOARD.md` from the brief (`storyboard`) and call `eligian_brief` with `action: approve-storyboard`. The server checks the storyboard against the brief; a `storyboard-mismatch` refusal lists the problems, each with its code. Fix them and call again. The user then approves the storyboard the same way as the brief: by dialog, or by the fallback with `confirmation` and `ticket`. The brief is `approved`; generation starts now.

## Changed answers

When an answer changes after confirmation, the gated tools refuse with `brief-changed`. A question whose prerequisite changed comes back in the round with `previous`: the answer it had. Ask it again, showing the previous answer as your recommendation when it still fits. Re-confirming shows only the changed answers.

## The whole tree

`brief-questions` lists every question with its prerequisites and when it applies. Read it to see what is coming, or to record answers the user gave ahead of the round.
