# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> Karaoke-style lyrics for `media/song.mp3` (20s): each line highlights when sung, with click-to-seek on each line, behind a Start button. The entry file is `main.eligian` in the current directory; `media/song.mp3` is already there. The presentation starts on a timeline named `Start` that shows the button `#start`; clicking `#start` switches to the audio timeline, named `Song`, which plays `media/song.mp3`. The song has five lines, the elements `#line-1` to `#line-5` (write your own words), sung on `Song` at: `#line-1` from 1s to 4s, `#line-2` from 4s to 8s, `#line-3` from 8s to 12s, `#line-4` from 12s to 16s, `#line-5` from 16s to 19s. A line is highlighted by carrying the class `active`, only while it is sung. Clicking a line seeks `Song` to the start of that line (clicking `#line-3` seeks to 8s).

- tree: 1
- state: complete
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: delegated
- round: 2

Viewers sing along with the highlighted lyrics.

### P2: What does the last screen ask of the viewer?

- by: delegated
- round: 3

none

### P3: Who watches, and what do they already know?

- by: delegated
- round: 1

Visitors of the song page.

### P4: What tone: formal, playful, technical, …?

- by: delegated
- round: 1

Warm.

### P5: How long should it take to watch?

- by: user
- round: 1

20s

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
| Start | A Start button before the song |
| Song | The song with its five lyric lines highlighted as they are sung |

### S3: Which view opens first?

- by: user
- round: 4

Start

### S4: From each view, where can the viewer go, and how?

- by: user
- round: 4

| view | target | trigger |
| --- | --- | --- |
| Start | Song | click #start |

### S5: When a view's timeline ends: stay, advance, loop, or return to the hub?

- by: delegated
- round: 4

| view | end |
| --- | --- |
| Start | stay |
| Song | stay |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: user
- round: 4

| view | provider | source |
| --- | --- | --- |
| Start | raf | - |
| Song | audio | media/song.mp3 |

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
- basis: 02e7c48729a10e6a

Press Start to sing along.

### V2: What is every text on it, word for word?

- by: delegated
- round: 6
- basis: 02e7c48729a10e6a

Title: Sing along
Button: Start

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 02e7c48729a10e6a

| element | kind | file |
| --- | --- | --- |
| Start button #start | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 5
- basis: 02e7c48729a10e6a

The title and the Start button show while the view is active.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 5
- basis: 02e7c48729a10e6a

| field | value |
| --- | --- |
| duration | none |
| pacing | none |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: user
- round: 5
- basis: 02e7c48729a10e6a

The Start button switches to the Song view.

## View: Song

### V1: What is the one thing this view says?

- by: delegated
- round: 6
- basis: 1fe8871de75c1f41

Sing along with the song.

### V2: What is every text on it, word for word?

- by: delegated
- round: 6
- basis: 1fe8871de75c1f41

Lines: The morning light comes softly in / It finds the window, finds the door / And every shadow on the floor / Gets up and dances once again / Until the day begins

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 1fe8871de75c1f41

| element | kind | file |
| --- | --- | --- |
| the song | audio | media/song.mp3 |
| lyric lines #line-1 to #line-5 | list | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: user
- round: 5
- basis: 1fe8871de75c1f41

Line 1 carries active from 1s to 4s, 2 from 4s to 8s, 3 from 8s to 12s, 4 from 12s to 16s, 5 from 16s to 19s.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: user
- round: 6
- basis: 1fe8871de75c1f41

| field | value |
| --- | --- |
| duration | 20 |
| pacing | cues |
| cues-from | the prompt |

### V6: Which elements react to a click or hover, and what does each do?

- by: user
- round: 5
- basis: 1fe8871de75c1f41

Clicking a line seeks the song to the start of that line.

## I: Interaction

### I1: Which transport controls: play, pause, restart, seek, and where are they?

- by: delegated
- round: 7

none

### I3: Is progress shown: a bar, a slide counter, a chapter menu?

- by: delegated
- round: 4

none

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
| Song | centred column |

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
| media/song.mp3 | none | none | no | no |

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

- by: delegated
- round: 8

transcript

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

Each line carries active only while it is sung, and a click on a line seeks to it.

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.2.0
- eligian-installed: -
- package-manager: -
- text-direction: en-US ltr

| asset | kind | state |
| --- | --- | --- |
| media/song.mp3 | audio | exists |
