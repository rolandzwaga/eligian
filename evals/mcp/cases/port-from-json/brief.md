# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> Here is an Eligius JSON config. Rewrite it as an Eligian project. The config is `source-config.json` in the current directory; the entry file of the project is `main.eligian` in the current directory. Keep the config's timelines (each timeline's name is its `uri`: `Hub`, `Chapter 1`, `Chapter 2` and `Timeline & Time`; the presentation starts on `Hub`), their durations, its action names, the operations of every action in their order, its controllers, the element ids of its `layoutTemplate` (that is the layout) and its locale strings; among those ids are `#stage`, `#hub`, `#hub-title`, `#card-1` to `#card-3` (the hub buttons), `#chapter-1` to `#chapter-3` (the views), `#back-1` to `#back-3` (the Back buttons), `#c3-title`, `#c3-intro`, `#c3-box`, `#c3-beat-2` and `#c3-beat-3`. The stylesheet that its `cssFiles` names is not supplied: write it, so that a `.view` is shown only while it carries the class `is-active` and a `.beat` only while it carries the class `is-visible`.

- tree: 1
- state: complete
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: delegated
- round: 2

The Eligian project does what the JSON config did.

### P2: What does the last screen ask of the viewer?

- by: delegated
- round: 2

none

### P3: Who watches, and what do they already know?

- by: delegated
- round: 1

Readers of the Eligian tour.

### P4: What tone: formal, playful, technical, …?

- by: delegated
- round: 1

Explanatory.

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

### C3: Which inputs: mouse, touch, keyboard, clicker?

- by: delegated
- round: 1

mouse, keyboard

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

hub-and-chapters

### S2: Which views are there: a name and a one-line purpose for each, in order?

- by: user
- round: 3

| name | purpose |
| --- | --- |
| Hub | The hub: the heading and the three chapter cards |
| Chapter 1 | Chapter 1: two beats |
| Chapter 2 | Chapter 2: one beat |
| Timeline & Time | Chapter 3: timelines and time, three beats and a lit box |

### S3: Which view opens first?

- by: user
- round: 4

Hub

### S4: From each view, where can the viewer go, and how?

- by: user
- round: 4

| view | target | trigger |
| --- | --- | --- |
| Hub | Chapter 1 | click #card-1 |
| Hub | Chapter 2 | click #card-2 |
| Hub | Timeline & Time | click #card-3 |
| Chapter 1 | Hub | click #back-1 or key Escape |
| Chapter 2 | Hub | click #back-2 or key Escape |
| Timeline & Time | Hub | click #back-3 or key Escape |

### S5: When a view's timeline ends: stay, advance, loop, or return to the hub?

- by: delegated
- round: 4

| view | end |
| --- | --- |
| Hub | stay |
| Chapter 1 | stay |
| Chapter 2 | stay |
| Timeline & Time | stay |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: delegated
- round: 4

| view | provider | source |
| --- | --- | --- |
| Hub | raf | - |
| Chapter 1 | raf | - |
| Chapter 2 | raf | - |
| Timeline & Time | raf | - |

### S8: After the last view: stay, restart, or loop?

- by: delegated
- round: 4

stay

## V: One copy per view

_One section per view below._

## View: Hub

### V1: What is the one thing this view says?

- by: delegated
- round: 7
- basis: 302545b98f9da093

Pick a chapter.

### V2: What is every text on it, word for word?

- by: delegated
- round: 8
- basis: 302545b98f9da093

Heading: the hub title from the locale strings
Cards: Chapter 1, Chapter 2, Timeline & Time

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 302545b98f9da093

| element | kind | file |
| --- | --- | --- |
| chapter cards #card-1 to #card-3 | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 6
- basis: 302545b98f9da093

Everything shows on entering the hub and stays while it is active.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 6
- basis: 302545b98f9da093

| field | value |
| --- | --- |
| duration | none |
| pacing | none |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: delegated
- round: 5
- basis: 302545b98f9da093

Each card opens its chapter.

## View: Chapter 1

### V1: What is the one thing this view says?

- by: delegated
- round: 7
- basis: 47a663afc5a9f6a4

How to move through a chapter.

### V2: What is every text on it, word for word?

- by: delegated
- round: 8
- basis: 47a663afc5a9f6a4

Title: Chapter 1
Beats: Press → to skip to the next beat. / Press Esc to go back to the hub.
Button: Back to the hub

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 47a663afc5a9f6a4

| element | kind | file |
| --- | --- | --- |
| Back button #back-1 | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 6
- basis: 47a663afc5a9f6a4

Beat 1 from 0s to 4s, beat 2 from 4s to 8s.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 6
- basis: 47a663afc5a9f6a4

| field | value |
| --- | --- |
| duration | 8 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: delegated
- round: 5
- basis: 47a663afc5a9f6a4

The Back button returns to the hub.

## View: Chapter 2

### V1: What is the one thing this view says?

- by: delegated
- round: 7
- basis: e921c4aa04b0d5a1

Each chapter is a timeline of its own.

### V2: What is every text on it, word for word?

- by: delegated
- round: 8
- basis: e921c4aa04b0d5a1

Title: Chapter 2
Beat: Each chapter is a timeline of its own.
Button: Back to the hub

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: e921c4aa04b0d5a1

| element | kind | file |
| --- | --- | --- |
| Back button #back-2 | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 6
- basis: e921c4aa04b0d5a1

The beat from 0s to 4s.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 7
- basis: e921c4aa04b0d5a1

| field | value |
| --- | --- |
| duration | 4 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: delegated
- round: 5
- basis: e921c4aa04b0d5a1

The Back button returns to the hub.

## View: Timeline & Time

### V1: What is the one thing this view says?

- by: delegated
- round: 8
- basis: a0f5a40d37d31a0b

A timeline schedules its events over ranges.

### V2: What is every text on it, word for word?

- by: delegated
- round: 8
- basis: a0f5a40d37d31a0b

Title and intro: from the locale strings
Beats: A timeline schedules its events on a clock. / Each event runs over a range: from its start to its end. / Name a time with const, label an event with as.
Box: target
Button: Back to the hub

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: a0f5a40d37d31a0b

| element | kind | file |
| --- | --- | --- |
| box #c3-box | figure | - |
| Back button #back-3 | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 6
- basis: a0f5a40d37d31a0b

Beat 1 from 0s to 3s, beat 2 from 3s to 6s, the box lit from 6s to 10s, beat 3 from 10s to 13s.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 7
- basis: a0f5a40d37d31a0b

| field | value |
| --- | --- |
| duration | 13 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: delegated
- round: 6
- basis: a0f5a40d37d31a0b

The Back button returns to the hub.

## I: Interaction

### I1: Which transport controls: play, pause, restart, seek, and where are they?

- by: delegated
- round: 8

none

### I2: Which keys do what?

- by: user
- round: 7

| key | action |
| --- | --- |
| Escape | back to the hub (each chapter) |
| ArrowRight | seek Chapter 1 to 4s |
| space | play or pause Timeline & Time |

### I3: Is progress shown: a bar, a slide counter, a chapter menu?

- by: delegated
- round: 4

none

### I4: When the viewer returns to a view: restart at 0, or resume?

- by: delegated
- round: 8

restart

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
| Hub | centred column |
| Chapter 1 | centred column |
| Chapter 2 | centred column |
| Timeline & Time | centred column |

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

- by: user
- round: 2

| code | default |
| --- | --- |
| en-US | yes |
| nl-NL | no |

### L2: Who supplies each translation, and when?

- by: user
- round: 3

| language | supplier | when |
| --- | --- | --- |
| en-US | the config's locale strings | already supplied |
| nl-NL | the config's locale strings | already supplied |

### L3: Where does the viewer switch language, and what does the switch look like?

- by: delegated
- round: 3

Nowhere: the config has no language switch.

## A: Assets

_No answers yet._

## H: Custom behaviour

### H1: Does anything need code beyond the built-in operations: analytics, charts, form input, external data, gestures?

- by: delegated
- round: 7

none

## X: Accessibility

### X1: Which target: WCAG 2.2 AA, best effort, or none stated?

- by: delegated
- round: 9

best-effort

### X2: Must every interaction work with the keyboard alone?

- by: delegated
- round: 9

no

### X3: On a view change: move focus, and announce the view to screen readers?

- by: delegated
- round: 9

| field | value |
| --- | --- |
| focus | no |
| announce | no |

## R: Delivery

### R1: Where does it run: a standalone page (`--bundle`), inside an existing site or app, or an offline bundle?

- by: delegated
- round: 9

| field | value |
| --- | --- |
| choice | standalone |
| detail | a page of its own, built with --bundle |

### R2: Which browsers?

- by: delegated
- round: 9

Current Chrome, Edge, Firefox and Safari.

### R3: Which directory and entry file name?

- by: user
- round: 9

main.eligian

### R4: Are any actions shared with other presentations (a library file)?

- by: delegated
- round: 9

no

## W: Working agreement

### W1: What may the agent decide on its own during the build, beyond the delegated answers?

- by: delegated
- round: 11

Colours, spacing, easing and the wording of anything the prompt does not fix.

### W2: When does the user look: after the first view, or only at the end? (The storyboard approval is fixed.)

- by: delegated
- round: 10

end

### W3: What is "done" beyond the tools passing?

- by: delegated
- round: 10

The project keeps the config's timelines, durations, actions, operations, controllers, layout ids and locale strings.

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.2.0
- eligian-installed: -
- package-manager: -
- text-direction: en-US ltr, nl-NL ltr
- assets: none
