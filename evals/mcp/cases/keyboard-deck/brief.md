# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> A 12-slide deck navigated with the arrow keys; Home returns to slide 1. Slide numbers shown bottom-right. The entry file is `main.eligian` in the current directory. Every slide is its own timeline, named `slide-1` to `slide-12`, running in the container `#deck`; the deck starts on `slide-1`. ArrowRight goes to the next slide, ArrowLeft to the previous one, Home to `slide-1`; declare the keys with `on key` on each slide timeline, without `in`, so they listen on `#deck`. Use these element ids: `#slide-1` to `#slide-12` (each visible only while its timeline is active) and `#counter` (the slide number, whose text is exactly `<n> / 12`, for example `4 / 12`). An element counts as hidden when it or an ancestor has the `hidden` attribute or computes `display: none`, `visibility: hidden` or `opacity: 0` from your CSS; otherwise it is visible.

- tree: 1
- state: complete
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: delegated
- round: 2

The audience follows the talk slide by slide.

### P2: What does the last screen ask of the viewer?

- by: delegated
- round: 2

none

### P3: Who watches, and what do they already know?

- by: delegated
- round: 1

A talk audience; the speaker drives the deck.

### P4: What tone: formal, playful, technical, …?

- by: delegated
- round: 1

Plain.

### P5: How long should it take to watch?

- by: delegated
- round: 1

viewer-paced

## C: Context of use

### C1: How is it used: self-paced on a web page, led by a presenter, an unattended loop, or embedded in an app?

- by: delegated
- round: 1

presenter

### C2: On which devices, and which is the main one?

- by: delegated
- round: 2

| device | primary |
| --- | --- |
| large-screen | yes |

### C3: Which inputs: mouse, touch, keyboard, clicker?

- by: user
- round: 1

keyboard

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

slide-deck

### S2: Which views are there: a name and a one-line purpose for each, in order?

- by: user
- round: 3

| name | purpose |
| --- | --- |
| slide-1 | Slide 1 of 12 |
| slide-2 | Slide 2 of 12 |
| slide-3 | Slide 3 of 12 |
| slide-4 | Slide 4 of 12 |
| slide-5 | Slide 5 of 12 |
| slide-6 | Slide 6 of 12 |
| slide-7 | Slide 7 of 12 |
| slide-8 | Slide 8 of 12 |
| slide-9 | Slide 9 of 12 |
| slide-10 | Slide 10 of 12 |
| slide-11 | Slide 11 of 12 |
| slide-12 | Slide 12 of 12 |

### S3: Which view opens first?

- by: user
- round: 4

slide-1

### S4: From each view, where can the viewer go, and how?

- by: user
- round: 4

| view | target | trigger |
| --- | --- | --- |
| slide-1 | slide-2 | key ArrowRight |
| slide-2 | slide-3 | key ArrowRight |
| slide-2 | slide-1 | key ArrowLeft |
| slide-2 | slide-1 | key Home |
| slide-3 | slide-4 | key ArrowRight |
| slide-3 | slide-2 | key ArrowLeft |
| slide-3 | slide-1 | key Home |
| slide-4 | slide-5 | key ArrowRight |
| slide-4 | slide-3 | key ArrowLeft |
| slide-4 | slide-1 | key Home |
| slide-5 | slide-6 | key ArrowRight |
| slide-5 | slide-4 | key ArrowLeft |
| slide-5 | slide-1 | key Home |
| slide-6 | slide-7 | key ArrowRight |
| slide-6 | slide-5 | key ArrowLeft |
| slide-6 | slide-1 | key Home |
| slide-7 | slide-8 | key ArrowRight |
| slide-7 | slide-6 | key ArrowLeft |
| slide-7 | slide-1 | key Home |
| slide-8 | slide-9 | key ArrowRight |
| slide-8 | slide-7 | key ArrowLeft |
| slide-8 | slide-1 | key Home |
| slide-9 | slide-10 | key ArrowRight |
| slide-9 | slide-8 | key ArrowLeft |
| slide-9 | slide-1 | key Home |
| slide-10 | slide-11 | key ArrowRight |
| slide-10 | slide-9 | key ArrowLeft |
| slide-10 | slide-1 | key Home |
| slide-11 | slide-12 | key ArrowRight |
| slide-11 | slide-10 | key ArrowLeft |
| slide-11 | slide-1 | key Home |
| slide-12 | slide-11 | key ArrowLeft |
| slide-12 | slide-1 | key Home |

### S5: When a view's timeline ends: stay, advance, loop, or return to the hub?

- by: delegated
- round: 4

| view | end |
| --- | --- |
| slide-1 | stay |
| slide-2 | stay |
| slide-3 | stay |
| slide-4 | stay |
| slide-5 | stay |
| slide-6 | stay |
| slide-7 | stay |
| slide-8 | stay |
| slide-9 | stay |
| slide-10 | stay |
| slide-11 | stay |
| slide-12 | stay |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: delegated
- round: 4

| view | provider | source |
| --- | --- | --- |
| slide-1 | raf | - |
| slide-2 | raf | - |
| slide-3 | raf | - |
| slide-4 | raf | - |
| slide-5 | raf | - |
| slide-6 | raf | - |
| slide-7 | raf | - |
| slide-8 | raf | - |
| slide-9 | raf | - |
| slide-10 | raf | - |
| slide-11 | raf | - |
| slide-12 | raf | - |

### S8: After the last view: stay, restart, or loop?

- by: delegated
- round: 4

stay

## V: One copy per view

_One section per view below._

## View: slide-1

### V1: What is the one thing this view says?

- by: delegated
- round: 5
- basis: 612d995ffaac9e31

The slide title.

### V2: What is every text on it, word for word?

- by: delegated
- round: 5
- basis: 612d995ffaac9e31

Slide titles: Welcome, The problem, Who it hurts, What we tried, What we learned, The idea, How it works, A first test, The numbers, What is next, The ask, Thank you
Counter: <n> / 12

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 612d995ffaac9e31

| element | kind | file |
| --- | --- | --- |
| slide #slide-<n> | text | - |
| slide number #counter | text | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 5
- basis: 612d995ffaac9e31

The slide shows while its timeline is active; the counter reads <n> / 12.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 5
- basis: 612d995ffaac9e31

| field | value |
| --- | --- |
| duration | 1 |
| pacing | fixed |
| cues-from | - |

## View: slide-2

### V: same as

- by: delegated
- round: 4
- basis: e0028278e616f02b

same as slide-1

## View: slide-3

### V: same as

- by: delegated
- round: 4
- basis: ff9f2f162216d105

same as slide-1

## View: slide-4

### V: same as

- by: delegated
- round: 4
- basis: 77a226b3d81b3604

same as slide-1

## View: slide-5

### V: same as

- by: delegated
- round: 4
- basis: 1c68c16a2327afd2

same as slide-1

## View: slide-6

### V: same as

- by: delegated
- round: 4
- basis: 30695c55f806a976

same as slide-1

## View: slide-7

### V: same as

- by: delegated
- round: 4
- basis: ffccbc14be626e8a

same as slide-1

## View: slide-8

### V: same as

- by: delegated
- round: 4
- basis: 4fffda87b8babff7

same as slide-1

## View: slide-9

### V: same as

- by: delegated
- round: 4
- basis: 23c9479f77b4947e

same as slide-1

## View: slide-10

### V: same as

- by: delegated
- round: 4
- basis: b8f5fd40cae05a63

same as slide-1

## View: slide-11

### V: same as

- by: delegated
- round: 4
- basis: f65e700888f150ae

same as slide-1

## View: slide-12

### V: same as

- by: delegated
- round: 4
- basis: f3c7d6b44e63b82a

same as slide-1

## I: Interaction

### I1: Which transport controls: play, pause, restart, seek, and where are they?

- by: delegated
- round: 6

none

### I2: Which keys do what?

- by: user
- round: 5

| key | action |
| --- | --- |
| ArrowRight | the next slide |
| ArrowLeft | the previous slide |
| Home | slide-1 |

### I3: Is progress shown: a bar, a slide counter, a chapter menu?

- by: user
- round: 4

counter

### I4: When the viewer returns to a view: restart at 0, or resume?

- by: delegated
- round: 5

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
| slide-1 | centred column |
| slide-2 | centred column |
| slide-3 | centred column |
| slide-4 | centred column |
| slide-5 | centred column |
| slide-6 | centred column |
| slide-7 | centred column |
| slide-8 | centred column |
| slide-9 | centred column |
| slide-10 | centred column |
| slide-11 | centred column |
| slide-12 | centred column |

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

yes

### X3: On a view change: move focus, and announce the view to screen readers?

- by: delegated
- round: 6

| field | value |
| --- | --- |
| focus | no |
| announce | no |

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
- round: 6

Current Chrome, Edge, Firefox and Safari.

### R3: Which directory and entry file name?

- by: user
- round: 6

main.eligian

### R4: Are any actions shared with other presentations (a library file)?

- by: delegated
- round: 6

no

## W: Working agreement

### W1: What may the agent decide on its own during the build, beyond the delegated answers?

- by: delegated
- round: 8

Colours, spacing, easing and the wording of anything the prompt does not fix.

### W2: When does the user look: after the first view, or only at the end? (The storyboard approval is fixed.)

- by: delegated
- round: 7

end

### W3: What is "done" beyond the tools passing?

- by: delegated
- round: 7

Every key goes where the prompt says, the counter reads <n> / 12, each slide hidden and visible as the prompt defines them.

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.2.0
- eligian-installed: -
- package-manager: -
- text-direction: en-US ltr
- assets: none
