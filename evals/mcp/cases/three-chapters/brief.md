# Brief

<!-- Written by eligian_brief. Agents: change answers only through eligian_brief. People may edit by hand; the tool re-reads this file on every call. -->

> A three-chapter product story (Problem, Solution, Results). A hub with three buttons, each chapter its own timeline with a Back button. Chapter text in English and Dutch, with a language toggle. The entry file is `main.eligian` in the current directory. Name the timelines `Hub`, `Problem`, `Solution` and `Results`; the presentation starts on `Hub`. Use these element ids: `#hub`, `#problem`, `#solution` and `#results` (the views, each visible only while its timeline is active); `#to-problem`, `#to-solution` and `#to-results` (the hub buttons); `#back-problem`, `#back-solution` and `#back-results` (the Back button of each chapter, which returns to `Hub`); `#hub-title` (the hub heading, a localized label that reads `Our product story` in English and `Ons productverhaal` in Dutch); `#lang-nl` and `#lang-en` (the language toggle, usable on the hub: switch to Dutch, switch to English). English (`en-US`) is the default, Dutch is `nl-NL`. Only `#hub-title` and the chapter text are localized; the buttons keep fixed English text (no label controller on them). An element counts as hidden when it or an ancestor has the `hidden` attribute or computes `display: none`, `visibility: hidden` or `opacity: 0` from your CSS; otherwise it is visible.

- tree: 1
- state: complete
- confirmation: none
- approval: none

## P: Purpose

### P1: What should a viewer know, feel or do afterwards?

- by: delegated
- round: 2

Viewers understand the problem, the solution and the results of the product.

### P2: What does the last screen ask of the viewer?

- by: delegated
- round: 3

none

### P3: Who watches, and what do they already know?

- by: delegated
- round: 1

Prospects on the product page; they know the problem, not the product.

### P4: What tone: formal, playful, technical, …?

- by: delegated
- round: 1

Clear and confident.

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

hub-and-chapters

### S2: Which views are there: a name and a one-line purpose for each, in order?

- by: user
- round: 3

| name | purpose |
| --- | --- |
| Hub | The hub: the heading, three chapter buttons and the language toggle |
| Problem | The problem chapter of the product story |
| Solution | The solution chapter of the product story |
| Results | The results chapter of the product story |

### S3: Which view opens first?

- by: user
- round: 4

Hub

### S4: From each view, where can the viewer go, and how?

- by: user
- round: 4

| view | target | trigger |
| --- | --- | --- |
| Hub | Problem | click #to-problem |
| Hub | Solution | click #to-solution |
| Hub | Results | click #to-results |
| Problem | Hub | click #back-problem |
| Solution | Hub | click #back-solution |
| Results | Hub | click #back-results |

### S5: When a view's timeline ends: stay, advance, loop, or return to the hub?

- by: delegated
- round: 4

| view | end |
| --- | --- |
| Hub | stay |
| Problem | stay |
| Solution | stay |
| Results | stay |

### S6: What drives each view's time: `raf`, `video`, `audio`, `scroll`?

- by: delegated
- round: 4

| view | provider | source |
| --- | --- | --- |
| Hub | raf | - |
| Problem | raf | - |
| Solution | raf | - |
| Results | raf | - |

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
- basis: 54a53e6c3b880a6d

Pick a chapter of the product story.

### V2: What is every text on it, word for word?

- by: delegated
- round: 8
- basis: 54a53e6c3b880a6d

Heading: Our product story (Dutch: Ons productverhaal)
Buttons: Problem, Solution, Results
Language toggle: Nederlands, English

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 54a53e6c3b880a6d

| element | kind | file |
| --- | --- | --- |
| heading #hub-title | text | - |
| chapter buttons #to-problem #to-solution #to-results | button | - |
| language toggle #lang-nl #lang-en | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 6
- basis: 54a53e6c3b880a6d

Everything shows on entering the hub and stays while it is active.

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 6
- basis: 54a53e6c3b880a6d

| field | value |
| --- | --- |
| duration | none |
| pacing | none |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: user
- round: 5
- basis: 54a53e6c3b880a6d

The three buttons open their chapter; #lang-nl switches to Dutch, #lang-en to English.

## View: Problem

### V1: What is the one thing this view says?

- by: delegated
- round: 7
- basis: eb3ce251ea02adb8

Presentations are hard to keep in sync with their content.

### V2: What is every text on it, word for word?

- by: delegated
- round: 8
- basis: eb3ce251ea02adb8

Title: The problem (Het probleem)
Text: Presentations are hard to keep in sync with their content. (Presentaties lopen moeilijk gelijk met hun inhoud.)
Button: Back

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: eb3ce251ea02adb8

| element | kind | file |
| --- | --- | --- |
| title | text | - |
| text | text | - |
| Back button #back-problem | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 6
- basis: eb3ce251ea02adb8

The title appears at 0s, the text at 1s; both stay to the end (8s).

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 6
- basis: eb3ce251ea02adb8

| field | value |
| --- | --- |
| duration | 8 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: user
- round: 5
- basis: eb3ce251ea02adb8

The Back button returns to the hub.

## View: Solution

### V1: What is the one thing this view says?

- by: delegated
- round: 7
- basis: 34462b793c666cc1

Write the presentation as code and let the compiler check it.

### V2: What is every text on it, word for word?

- by: delegated
- round: 8
- basis: 34462b793c666cc1

Title: The solution (De oplossing)
Text: Write the presentation as code and let the compiler check it. (Schrijf de presentatie als code en laat de compiler haar controleren.)
Button: Back

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 34462b793c666cc1

| element | kind | file |
| --- | --- | --- |
| title | text | - |
| text | text | - |
| Back button #back-solution | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 6
- basis: 34462b793c666cc1

The title appears at 0s, the text at 1s; both stay to the end (8s).

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 7
- basis: 34462b793c666cc1

| field | value |
| --- | --- |
| duration | 8 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: user
- round: 5
- basis: 34462b793c666cc1

The Back button returns to the hub.

## View: Results

### V1: What is the one thing this view says?

- by: delegated
- round: 7
- basis: 0aa09827c7490bd8

Fewer broken slides, and every change reviewed like code.

### V2: What is every text on it, word for word?

- by: delegated
- round: 8
- basis: 0aa09827c7490bd8

Title: The results (De resultaten)
Text: Fewer broken slides, and every change reviewed like code. (Minder kapotte slides, en elke wijziging beoordeeld als code.)
Button: Back

### V3: What is on screen besides text: images, video, lists, figures, buttons?

- by: delegated
- round: 5
- basis: 0aa09827c7490bd8

| element | kind | file |
| --- | --- | --- |
| title | text | - |
| text | text | - |
| Back button #back-results | button | - |

### V4: What appears, changes and disappears, in what order, and what stays to the end?

- by: delegated
- round: 6
- basis: 0aa09827c7490bd8

The title appears at 0s, the text at 1s; both stay to the end (8s).

### V5: How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?

- by: delegated
- round: 7
- basis: 0aa09827c7490bd8

| field | value |
| --- | --- |
| duration | 8 |
| pacing | fixed |
| cues-from | - |

### V6: Which elements react to a click or hover, and what does each do?

- by: user
- round: 6
- basis: 0aa09827c7490bd8

The Back button returns to the hub.

## I: Interaction

### I1: Which transport controls: play, pause, restart, seek, and where are they?

- by: delegated
- round: 8

none

### I3: Is progress shown: a bar, a slide counter, a chapter menu?

- by: delegated
- round: 4

none

### I4: When the viewer returns to a view: restart at 0, or resume?

- by: delegated
- round: 8

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
| Hub | centred column |
| Problem | centred column |
| Solution | centred column |
| Results | centred column |

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

- by: delegated
- round: 3

| language | supplier | when |
| --- | --- | --- |
| en-US | the product team | before the build |
| nl-NL | the product team | before the build |

### L3: Where does the viewer switch language, and what does the switch look like?

- by: user
- round: 8

On the hub: two buttons, Nederlands (#lang-nl) and English (#lang-en).

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

Each view is hidden and visible as the prompt defines them, and the hub heading reads right in both languages.

## Facts

<!-- Computed by eligian_brief when it writes this file; never read back. -->

- server-eligian: 1.2.0
- eligian-installed: -
- package-manager: -
- text-direction: en-US ltr, nl-NL ltr
- assets: none
