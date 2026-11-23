# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> Type out a sentence character by character over 4 seconds, then count a number up from 0 to 250 over 3 seconds. The entry file is `main.eligian` in the current directory, with one timeline named `typewriter` that runs 8 seconds. The sentence is exactly `Every great story starts with a single line.`; it is typed into `#sentence`, which is empty at 0s, grows one character at a time and reads the full sentence from 4s (including at exactly 4s) to the end of the timeline. The number is shown in `#counter`: it counts up from `0` at 4s to `250` at 7s and its text is exactly `250` from 7s (including at exactly 7s) to the end of the timeline.

- tree: 1
- state: complete
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: delegated
- round: 2

Viewers read the sentence and see the number.

### P2: What does the last screen ask of the viewer?

- by: delegated
- round: 3

none

### P3: Who watches, and what do they already know?

- by: delegated
- round: 1

Visitors of a landing page.

### P4: What tone: formal, playful, technical, …?

- by: delegated
- round: 1

Playful.

### P5: How long should it take to watch?

- by: user
- round: 1

8s

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

timed-piece

### S2: Which views are there: a name and a one-line purpose for each, in order?

- by: user
- round: 3

| name | purpose |
| --- | --- |
| typewriter | A sentence typed out, then a number counted up |

### S5: When a view's timeline ends: stay, advance, loop, or return to the hub?

- by: delegated
- round: 4

| view | end |
| --- | --- |
| typewriter | stay |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: delegated
- round: 4

| view | provider | source |
| --- | --- | --- |
| typewriter | raf | - |

### S8: After the last view: stay, restart, or loop?

- by: delegated
- round: 4

stay

## V: One copy per view

_One section per view below._

## View: typewriter

### V1: What is the one thing this view says?

- by: delegated
- round: 5
- basis: be29cf4f0233a0b6

Every great story starts with a single line.

### V2: What is every text on it, word for word?

- by: user
- round: 5
- basis: be29cf4f0233a0b6

Sentence: Every great story starts with a single line.
Counter: 0 to 250

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: be29cf4f0233a0b6

| element | kind | file |
| --- | --- | --- |
| sentence #sentence | text | - |
| counter #counter | text | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: user
- round: 5
- basis: be29cf4f0233a0b6

The sentence is typed from 0s to 4s and stays; the counter counts from 0 at 4s to 250 at 7s and stays.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: user
- round: 5
- basis: be29cf4f0233a0b6

| field | value |
| --- | --- |
| duration | 8 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: delegated
- round: 5
- basis: be29cf4f0233a0b6

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
| typewriter | centred column |

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

The sentence and the number read exactly as the prompt says at the prompt's times.

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.2.0
- eligian-installed: -
- package-manager: -
- text-direction: en-US ltr
- assets: none
