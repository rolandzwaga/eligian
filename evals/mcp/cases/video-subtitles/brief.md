# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> Subtitle track over the video `media/intro.mp4` (30s): five captions at given times, with a progress bar. The presentation starts from a Start button. The entry file is `main.eligian` in the current directory; `media/intro.mp4` is already there. The presentation starts on a timeline named `Start` that shows the button `#start`; clicking `#start` switches to the video timeline, named `Video`, which plays `media/intro.mp4`. The captions are the elements `#caption-1` to `#caption-5`, each visible only within its time range on `Video` and hidden outside it: `#caption-1` from 2s to 7s, `#caption-2` from 8s to 13s, `#caption-3` from 14s to 19s, `#caption-4` from 20s to 25s, `#caption-5` from 26s to 29s. The progress bar is the element `#progress`. An element counts as hidden when it or an ancestor has the `hidden` attribute or computes `display: none`, `visibility: hidden` or `opacity: 0` from your CSS; otherwise it is visible.

- tree: 1
- state: complete
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: delegated
- round: 2

Viewers watch the intro with its captions.

### P2: What does the last screen ask of the viewer?

- by: delegated
- round: 3

none

### P3: Who watches, and what do they already know?

- by: delegated
- round: 1

Visitors of the intro page.

### P4: What tone: formal, playful, technical, …?

- by: delegated
- round: 1

Friendly.

### P5: How long should it take to watch?

- by: user
- round: 1

30s

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

on

### C5: Online, or must it run offline?

- by: delegated
- round: 1

online

## S: Structure

### S1: Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece?

- by: delegated
- round: 2

media-annotation

### S2: Which views are there: a name and a one-line purpose for each, in order?

- by: user
- round: 3

| name | purpose |
| --- | --- |
| Start | A Start button before the video |
| Video | The intro video with five timed captions and a progress bar |

### S3: Which view opens first?

- by: user
- round: 4

Start

### S4: From each view, where can the viewer go, and how?

- by: user
- round: 4

| view | target | trigger |
| --- | --- | --- |
| Start | Video | click #start |

### S5: When a view's timeline ends: stay, advance, loop, or return to the hub?

- by: delegated
- round: 4

| view | end |
| --- | --- |
| Start | stay |
| Video | stay |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: user
- round: 4

| view | provider | source |
| --- | --- | --- |
| Start | raf | - |
| Video | video | media/intro.mp4 |

### S7: Is there a Start button before media with sound?

- by: user
- round: 6

yes

### S8: After the last view: stay, restart, or loop?

- by: delegated
- round: 4

stay

## V: One copy per view

_One section per view below._

## View: Start

### V1: What is the one thing this view says?

- by: delegated
- round: 6
- basis: 3c9847ff4e65122b

Press Start to play the intro.

### V2: What is every text on it, word for word?

- by: delegated
- round: 6
- basis: 3c9847ff4e65122b

Title: Intro
Button: Start

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 3c9847ff4e65122b

| element | kind | file |
| --- | --- | --- |
| Start button #start | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 5
- basis: 3c9847ff4e65122b

The title and the Start button show while the view is active.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 5
- basis: 3c9847ff4e65122b

| field | value |
| --- | --- |
| duration | none |
| pacing | none |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: user
- round: 5
- basis: 3c9847ff4e65122b

The Start button switches to the Video view.

## View: Video

### V1: What is the one thing this view says?

- by: delegated
- round: 6
- basis: 3345eb1f2137b1bb

The intro, captioned.

### V2: What is every text on it, word for word?

- by: delegated
- round: 6
- basis: 3345eb1f2137b1bb

Captions: Welcome to the intro. / The video drives the timeline. / Each caption is a timed range. / Seek, and the captions follow. / Thanks for watching.

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: user
- round: 5
- basis: 3345eb1f2137b1bb

| element | kind | file |
| --- | --- | --- |
| the intro video | video | media/intro.mp4 |
| captions #caption-1 to #caption-5 | text | - |
| progress bar #progress | figure | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: user
- round: 5
- basis: 3345eb1f2137b1bb

Caption 1 from 2s to 7s, 2 from 8s to 13s, 3 from 14s to 19s, 4 from 20s to 25s, 5 from 26s to 29s; the progress bar fills over the 30s.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: user
- round: 6
- basis: 3345eb1f2137b1bb

| field | value |
| --- | --- |
| duration | 30 |
| pacing | cues |
| cues-from | the prompt |

### V6: Which elements react to a click or hover, and what does each do?

- by: delegated
- round: 5
- basis: 3345eb1f2137b1bb

none

## I: Interaction

### I1: Which transport controls: play, pause, restart, seek, and where are they?

- by: delegated
- round: 7

none

### I3: Is progress shown: a bar, a slide counter, a chapter menu?

- by: user
- round: 4

bar

### I4: When the viewer returns to a view: restart at 0, or resume?

- by: delegated
- round: 7

restart

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
| Start | centred column |
| Video | centred column |

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

### A3: Which licence or credit lines must be shown?

- by: delegated
- round: 7

none

### A4: For video and audio: poster image, captions track, loop, muted start?

- by: delegated
- round: 7

| file | poster | captions | loop | muted |
| --- | --- | --- | --- | --- |
| media/intro.mp4 | none | none | no | no |

### A6: Are the files in the project, or at remote URLs?

- by: user
- round: 7

project

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
- round: 7

no

### X3: On a view change: move focus, and announce the view to screen readers?

- by: delegated
- round: 7

| field | value |
| --- | --- |
| focus | no |
| announce | no |

### X4: Captions or a transcript for speech?

- by: user
- round: 8

captions

## R: Delivery

### R1: Where does it run: a standalone page (`--bundle`), inside an existing site or app, or an offline bundle?

- by: delegated
- round: 8

| field | value |
| --- | --- |
| choice | standalone |
| detail | a page of its own, built with --bundle |

### R2: Which browsers?

- by: delegated
- round: 8

Current Chrome, Edge, Firefox and Safari.

### R3: Which directory and entry file name?

- by: user
- round: 8

main.eligian

### R4: Are any actions shared with other presentations (a library file)?

- by: delegated
- round: 8

no

## W: Working agreement

### W1: What may the agent decide on its own during the build, beyond the delegated answers?

- by: delegated
- round: 9

Colours, spacing, easing and the wording of anything the prompt does not fix.

### W2: When does the user look: after the first view, or only at the end? (The storyboard approval is fixed.)

- by: delegated
- round: 8

end

### W3: What is "done" beyond the tools passing?

- by: delegated
- round: 8

Each caption shows only in its range, hidden and visible as the prompt defines them.

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.2.0
- eligian-installed: -
- package-manager: -
- text-direction: en-US ltr

| asset | kind | state |
| --- | --- | --- |
| media/intro.mp4 | video | exists |
