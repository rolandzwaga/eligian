# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> A scroll-driven explainer: as the reader scrolls a 4000px article, four illustrations appear and the heading changes. The entry file is `main.eligian` in the current directory, with one timeline named `story` that follows the scroll position of the element `#article` (the scrollable element, whose content is 4000px tall) and has a duration of 100s. Use these element ids: `#article`, `#heading` and `#illustration-1` to `#illustration-4`. The illustrations appear at 15s, 40s, 65s and 90s (`#illustration-1` at 15s, `#illustration-4` at 90s); each is hidden before it appears and stays visible from then on, up to and including the very end of the article (position 100s). The text of `#heading` is exactly `Where it begins` from 0s, `The turning point` from 40s, `What it changed` from 65s and `Where it goes next` from 90s up to and including position 100s. An element counts as hidden when it or an ancestor has the `hidden` attribute or computes `display: none`, `visibility: hidden` or `opacity: 0` from your CSS; otherwise it is visible.

- tree: 1
- state: complete
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: delegated
- round: 2

Readers follow the story as they scroll.

### P2: What does the last screen ask of the viewer?

- by: delegated
- round: 3

none

### P3: Who watches, and what do they already know?

- by: delegated
- round: 1

Readers of a long-form article.

### P4: What tone: formal, playful, technical, …?

- by: delegated
- round: 1

Thoughtful.

### P5: How long should it take to watch?

- by: delegated
- round: 1

viewer-paced

## C: Context of use

### C1: How is it used: self-paced on a web page, led by a presenter, an unattended loop, or embedded in an app?

- by: delegated
- round: 1

self-paced

### C2: On which devices, and which is the main one?

- by: delegated
- round: 2

| device | primary |
| --- | --- |
| desktop | yes |
| phone | no |

### C3: Which inputs: mouse, touch, keyboard, clicker?

- by: delegated
- round: 1

mouse, touch

### C4: Is sound heard, or must it work muted?

- by: delegated
- round: 1

off

### C5: Online, or must it run offline?

- by: delegated
- round: 1

online

## S: Structure

### S1: Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece?

- by: delegated
- round: 2

scrollytelling

### S2: Which views are there: a name and a one-line purpose for each, in order?

- by: user
- round: 3

| name | purpose |
| --- | --- |
| story | The article: scrolling reveals four illustrations and changes the heading |

### S5: When a view's timeline ends: stay, advance, loop, or return to the hub?

- by: delegated
- round: 4

| view | end |
| --- | --- |
| story | stay |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: user
- round: 4

| view | provider | source |
| --- | --- | --- |
| story | scroll | - |

### S8: After the last view: stay, restart, or loop?

- by: delegated
- round: 4

stay

## V: One copy per view

_One section per view below._

## View: story

### V1: What is the one thing this view says?

- by: delegated
- round: 5
- basis: 6734f206f26d6d14

How a seed becomes a forest and spreads again.

### V2: What is every text on it, word for word?

- by: user
- round: 5
- basis: 6734f206f26d6d14

Heading: Where it begins / The turning point / What it changed / Where it goes next
Illustrations: A seed in the ground; The first storm; A forest where a field was; Seeds on the wind

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 6734f206f26d6d14

| element | kind | file |
| --- | --- | --- |
| heading #heading | text | - |
| illustrations #illustration-1 to #illustration-4 | figure | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: user
- round: 5
- basis: 6734f206f26d6d14

The illustrations appear at 15s, 40s, 65s and 90s and stay; the heading changes at 40s, 65s and 90s; at 100s all four show with the last heading.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: user
- round: 5
- basis: 6734f206f26d6d14

| field | value |
| --- | --- |
| duration | 100 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: delegated
- round: 5
- basis: 6734f206f26d6d14

none

## I: Interaction

### I1: Which transport controls: play, pause, restart, seek, and where are they?

- by: delegated
- round: 6

none

### I3: Is progress shown: a bar, a slide counter, a chapter menu?

- by: delegated
- round: 4

none

### I5: Are touch gestures (swipe) needed? They are not built in and need a host module.

- by: delegated
- round: 2

no

## D: Visual design

### D1: Is there a brand guide, a design system, CSS or a site to match?

- by: delegated
- round: 2

none

### D2: Which colours (background, text, accent), and light, dark or both?

- by: delegated
- round: 3

Dark text on a light background with one blue accent; light only.

### D3: Which fonts, from where (system, files in the project, a CDN), under which licence?

- by: delegated
- round: 3

| font | source | file | licence |
| --- | --- | --- | --- |
| system-ui | system | - | - |

### D4: A fixed-ratio stage scaled to the window (which ratio), or a fluid layout (which breakpoints)?

- by: delegated
- round: 3

| field | value |
| --- | --- |
| choice | fluid |
| detail | one column below 600px |

### D5: Which layout does each view use: title, two columns, full-bleed media, …?

- by: delegated
- round: 4

| view | layout |
| --- | --- |
| story | centred column |

### D6: Which motion: kinds of transition, durations, easing, how expressive?

- by: delegated
- round: 2

Short fades and slides, about 300ms, ease-out; restrained.

### D7: Under reduced-motion settings: shorten or remove transitions, or keep them?

- by: delegated
- round: 3

remove

## L: Languages

### L1: Which languages, and which is the default?

- by: delegated
- round: 2

| code | default |
| --- | --- |
| en-US | yes |

## A: Assets

_No answers yet._

## H: Custom behaviour

### H1: Does anything need code beyond the built-in operations: analytics, charts, form input, external data, gestures?

- by: delegated
- round: 6

none

## X: Accessibility

### X1: Which target: WCAG 2.2 AA, best effort, or none stated?

- by: delegated
- round: 3

best-effort

### X2: Must every interaction work with the keyboard alone?

- by: delegated
- round: 6

no

## R: Delivery

### R1: Where does it run: a standalone page (`--bundle`), inside an existing site or app, or an offline bundle?

- by: delegated
- round: 4

| field | value |
| --- | --- |
| choice | standalone |
| detail | a page of its own, built with --bundle |

### R2: Which browsers?

- by: delegated
- round: 4

Current Chrome, Edge, Firefox and Safari.

### R3: Which directory and entry file name?

- by: user
- round: 5

main.eligian

### R4: Are any actions shared with other presentations (a library file)?

- by: delegated
- round: 6

no

## W: Working agreement

### W1: What may the agent decide on its own during the build, beyond the delegated answers?

- by: delegated
- round: 7

Colours, spacing, easing and the wording of anything the prompt does not fix.

### W2: When does the user look: after the first view, or only at the end? (The storyboard approval is fixed.)

- by: delegated
- round: 6

end

### W3: What is "done" beyond the tools passing?

- by: delegated
- round: 6

The illustrations and heading follow the scroll position, hidden and visible as the prompt defines them.

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.2.0
- eligian-installed: -
- package-manager: -
- text-direction: en-US ltr
- assets: none
