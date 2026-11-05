---
id: project-layout
title: "Project layout"
kind: orientation
use_cases:
  - "project structure"
see:
  - "decisions"
  - "storyboard"
card: "Where files go (main.eligian, layout.html, lib/, media/), naming, output."
---

# Project layout

Start every project from a starter (`eligian_init`, or `eligian init --template <name>`): each one checks with 0 errors and 0 warnings, and the layout below is theirs. Read the starter that matches the presentation before writing anything (`starter/blank`, `starter/chapters`, `starter/video`, `starter/library`).

## The directory

```
my-presentation/
  package.json         scripts check / build / fmt; devDependency eligian
  README.md
  STORYBOARD.md        the plan: views, beats, interactions (storyboard)
  main.eligian         the program: imports, actions, timelines
  layout.html          the HTML the presentation runs in
  styles.css           every class and selector the program uses
  locales.json         the texts, per language
  lib/effects.eligian  shared actions (library starter)
  media/intro.mp4      video or audio for a media timeline (video starter)
  assets/              images
  host.ts              optional host module (extensions)
  AGENTS.md CLAUDE.md .mcp.json   written by eligian_init when absent
```

`eligian_init` writes `.mcp.json`, `AGENTS.md` and `CLAUDE.md` only when they do not exist yet; an existing one is reported as skipped. Run `npm install` afterwards: it installs `eligian`, which both the scripts and the MCP server in `.mcp.json` run from `node_modules`.

## The files and their rules

- **`main.eligian`** is the entry. The starters' scripts check, build and format this file. A program has at least one timeline; the first declared timeline is the one the presentation opens with (the chapters starter declares its hub first).
- **All timelines of a presentation live in one program.** `navigate "Chapter 1"` must name a timeline of the same program; an unknown name is the error `unknown_navigate_target`. Another program is another presentation, with its own configuration.
- **`layout.html`** is the HTML fragment the presentation renders into its container. The starters use one root, `<div id="stage">`, and every timeline names a container inside it (`timeline "Intro" in "#stage" …`). Give an id to every element a timeline selects: `eligian_check` warns about an id selector that is in the CSS but not in the layout.
- **`styles.css`** holds every class the program adds or removes and every selector it uses; the checker validates both against it. State is a class (`is-visible`, `is-active`) with a CSS transition, not inline styles.
- **`locales.json`** maps each language code of the `languages` block to its texts: `{ "en-US": { "hub": { "title": "…" } }, "nl-NL": { … } }`. A `LabelController` shows a key such as `"hub.title"`.
- **Imports** are relative to the importing file (`"./layout.html"`, `"./lib/effects.eligian"`) and there is at most one `layout`, `styles`, `provider` and `locales` default import per program. Named imports bring in other assets: `import hint from "./hint.html"`, with the type inferred from the extension.
- **`media/`** holds the files of media timelines: `timeline "Film" in "#player" using video from "./media/intro.mp4"`. Eligius plays browser-playable files (MP4, WebM, MP3). If you cannot create the media file, say so: the video starter's note asks the author to add it.
- **`host.ts`** (or `host.js`) is code of your own, declared in the program with `extensions "./host.ts" { operation … controller … function … }`. It is user code that runs in the browser; add one only when no built-in operation does the job.

## Naming

- **Timelines** have string names, written as the reader would say them: `"Hub"`, `"Chapter 1"`. `navigate` uses the same string.
- **Ids** are kebab-case and say what and where: `#c1-beat-1`, `#card-2`, `#back-1`. One id per element a timeline touches.
- **State classes** are adjectives with `is-`: `is-visible`, `is-active`. Elements start hidden in CSS and a class shows them.
- **Actions** are camelCase verbs: `reveal`, `conceal`, `showView`, `hideView`. An action cannot take the name of a built-in operation. A pair that does and undoes something gets a matching pair of names.
- **Labels** of events (`at 0s for 4s as first`) are short identifiers used as `first.start` / `first.end`.

## When to split into a library

Move actions to `lib/<name>.eligian` (first line `library <name>`) when:

- two or more programs share them; or
- a set of actions is a reusable vocabulary (show / hide, highlight / clear) that the timelines only call.

A library holds only actions; `private action` hides a helper from importers. A library may import other libraries. Keep timelines, lifecycle blocks and event actions in the program: they cannot go in a library. Do not split a single small presentation into libraries just to make files shorter; the `library` starter shows the pattern when you need it.

## Build output

- `eligian main.eligian` writes `main.json`, the Eligius configuration (`-o` to choose the file). `--eligian-map` adds `main.eligian-map.json`, the map from compiled ids back to source lines.
- `eligian main.eligian --bundle --force` (the starters' `npm run build`) writes `main.bundle/` with `index.html` and `bundle.js`: open it in a browser. `--force` overwrites an existing bundle directory. Small images are inlined into the bundle.
- `eligian dev main.eligian` serves the same bundle and rebuilds it on change.

Never edit the output: it is regenerated on every build, and every id in it changes on every compile. Keep it out of version control.

see: decisions, storyboard
