# Storyboard: Orbit teaser

- audience: visitors of the product page, desktop
- provider: raf, video (a video is planned)
- languages: en-US (default), nl-NL
- assets: none
- host module: none

## view Intro (container #stage)

enter: show #intro, wire #next
leave: hide #intro, remove the #next listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Intro | 0 | 6 | #headline | addClass is-visible | removeClass is-visible |
| Intro | 2 | 6 | #tagline | addClass is-visible | removeClass is-visible |

## view Details (container #stage)

enter: show #details, wire #play and Escape
leave: hide #details, remove the #play listener and the keyboard listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Details | 0 | 8 | #point-1 | addClass is-visible | removeClass is-visible |
| Details | 3 | 8 | #point-2 | addClass is-visible | removeClass is-visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #next | Details | navigate | Intro |
| click #play | - | toggle | Details |
| key Escape | Intro | navigate | Details |
