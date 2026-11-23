# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> Make a 10-second title card presentation: a headline fades in at 1s, a subtitle slides up under it at 3s, both fade out at 8s. Play/pause buttons. The entry file is `main.eligian` in the current directory, with one timeline named `title`. Use these element ids: `#headline` (carries the class `in` from 1s to 8s, and is hidden outside that range), `#subtitle` (visible from 3s to 8s, hidden before and after), `#play` and `#pause` (the buttons). An element counts as hidden when it or an ancestor has the `hidden` attribute or computes `display: none`, `visibility: hidden` or `opacity: 0` from your CSS; otherwise it is visible.

- tree: 1
- state: complete
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: delegated
- round: 2

Viewers read the title and the subtitle of the piece.

### P2: What does the last screen ask of the viewer?

- by: delegated
- round: 2

none

### P3: Who watches, and what do they already know?

- by: delegated
- round: 1

Anyone opening the page; no prior knowledge.

### P4: What tone: formal, playful, technical, …?

- by: delegated
- round: 1

Calm and polished.

### P5: How long should it take to watch?

- by: user
- round: 1

10s

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

### C3: Which inputs: mouse, touch, keyboard, clicker?

- by: delegated
- round: 1

mouse

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

timed-piece

### S2: Which views are there: a name and a one-line purpose for each, in order?

- by: user
- round: 3

| name | purpose |
| --- | --- |
| title | The title card: the headline, then the subtitle under it |

### S5: When a view's timeline ends: stay, advance, loop, or return to the hub?

- by: delegated
- round: 4

| view | end |
| --- | --- |
| title | stay |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: delegated
- round: 4

| view | provider | source |
| --- | --- | --- |
| title | raf | - |

### S8: After the last view: stay, restart, or loop?

- by: delegated
- round: 4

stay

## V: One copy per view

_One section per view below._

## View: title

### V1: What is the one thing this view says?

- by: delegated
- round: 5
- basis: 24a36b3b6076086a

The name of the piece and what it is about.

### V2: What is every text on it, word for word?

- by: delegated
- round: 5
- basis: 24a36b3b6076086a

Headline: Eligian
Subtitle: Presentations as code
Buttons: Play, Pause

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: user
- round: 5
- basis: 24a36b3b6076086a

| element | kind | file |
| --- | --- | --- |
| headline #headline | text | - |
| subtitle #subtitle | text | - |
| play button #play | button | - |
| pause button #pause | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: user
- round: 5
- basis: 24a36b3b6076086a

The headline fades in at 1s (class in from 1s to 8s), the subtitle slides up under it at 3s, both fade out at 8s; nothing stays to the end.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: user
- round: 5
- basis: 24a36b3b6076086a

| field | value |
| --- | --- |
| duration | 10 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: user
- round: 5
- basis: 24a36b3b6076086a

The Play button plays the timeline, the Pause button pauses it.

## I: Interaction

### I1: Which transport controls: play, pause, restart, seek, and where are they?

- by: user
- round: 6

A Play button (#play) and a Pause button (#pause) under the title.

### I3: Is progress shown: a bar, a slide counter, a chapter menu?

- by: delegated
- round: 4

none

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
| title | centred column |

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
- round: 3

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
- round: 4

main.eligian

### R4: Are any actions shared with other presentations (a library file)?

- by: delegated
- round: 5

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

The headline and subtitle follow the prompt's times, hidden and visible as the prompt defines them.

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.2.0
- eligian-installed: -
- package-manager: -
- text-direction: en-US ltr
- assets: none
