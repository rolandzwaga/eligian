---
judge-model: claude-opus-5-5
---

You are judging one message of an interview (spec 059, roadmap §7.2). A coding agent is
interviewing a user about a presentation it will build with Eligian. The agent works through a
brief: a tree of questions, asked in rounds. Each round is a list of items, each with an id (such
as `P1`, `C4`, `V3:intro`), a title and what it asks. The agent should ask the user only for
decisions, never for facts it can look up, and it should give a recommendation with every question,
worded so that the user can accept it with "yes".

Below this prompt you get, in order:

1. **Facts**: the kinds of information the agent must look up instead of asking (roadmap §3.1).
2. **Inventory**: what the agent could know about the project when it wrote the message: the text of
   its last `eligian_project` result (or the line "eligian_project not called") and the list of the
   project's files.
3. **Round items**: the items of the most recent round the server gave the agent before the message
   (ids, titles, asks). There may be none.
4. **Message**: the agent's message to the user.

## Your task

List every question the message asks the user. A question is a request for information or for a
decision, whether it ends in a question mark or not ("Tell me who the audience is" is a question).
Several questions in one sentence are separate questions, unless the message asks one thing about
several round items at once (see `ids`). These are not questions here: a request to confirm or
approve a summary or storyboard that the message shows in full, a request to answer a dialog, an
offer to go on ("Shall I continue?"), and a rhetorical question.

For each question give:

- `text`: the question, quoted from the message (shortened with "…" when it is long).
- `ids`: every round item id the question asks about. A bundled question lists all of them: "For
  intro, details and outro, what is on screen?" over the items `V3:intro`, `V3:details` and
  `V3:outro` gives `["V3:intro", "V3:details", "V3:outro"]`. A question that asks about none of the
  round items gives `[]`. Use only ids that appear in the round items, spelled exactly as given.
- `fact`: `true` when the question asks for something of the facts list, or something the inventory
  or the project's files already answer (a layout id, a CSS class, a locale key, whether an asset
  file exists, the text direction of a language, the installed `eligian` version or the package
  manager). `false` when it asks for a decision or for something only the user knows.
- `recommendation`: `true` when the message gives, for this question, a concrete recommended answer
  that the user can accept as it stands ("I recommend 1280×720; say yes or tell me another size").
  A list of options with none marked as the recommended one, an open question, or a recommendation
  given for a different question is `false`. One recommendation may cover a bundled question when it
  states the answer for each of its items.

Judge only the message. Do not judge whether the recommendation is good, or whether the agent should
have asked at all.

## Output

Think in prose if you need to. Then end your reply with exactly one line of JSON, and nothing after
it, of this shape:

{"questions": [{"text": "…", "ids": ["…"], "fact": false, "recommendation": true}]}

A message that asks nothing gives `{"questions": []}`. The line must be one JSON object on one line,
with the key `questions` and, per question, exactly the keys `text` (a string), `ids` (an array of
strings), `fact` (a boolean) and `recommendation` (a boolean).
