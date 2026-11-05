# Storyboard: Port

- audience: readers of the Eligian tour, desktop, mouse and keyboard
- provider: raf (no media; the chapters are timed text)
- languages: en-US (default), nl-NL
- assets: none
- host module: none

## view Hub (container #stage)

enter: show #hub, label #hub-title, wire #card-1, #card-2 and #card-3
leave: hide #hub, remove the three card listeners and the #hub-title label

## view Chapter 1 (container #stage)

enter: show #chapter-1, wire #back-1, Escape and ArrowRight
leave: hide #chapter-1, remove the #back-1 listener and both keyboard listeners

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Chapter 1 | 0 | 4 | #c1-beat-1 | addClass is-visible | removeClass is-visible |
| Chapter 1 | 4 | 8 | #c1-beat-2 | addClass is-visible | removeClass is-visible |

## view Chapter 2 (container #stage)

enter: show #chapter-2, wire #back-2 and Escape
leave: hide #chapter-2, remove the #back-2 listener and the keyboard listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Chapter 2 | 0 | 4 | #c2-beat-1 | addClass is-visible | removeClass is-visible |

## view Timeline & Time (container #stage)

enter: show #chapter-3, label #c3-title and #c3-intro, wire #back-3, Escape and space
leave: hide #chapter-3, remove both labels, the #back-3 listener and both keyboard listeners

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Timeline & Time | 0 | 3 | #c3-beat-1 | addClass is-visible | removeClass is-visible |
| Timeline & Time | 3 | 6 | #c3-beat-2 | addClass is-visible | removeClass is-visible |
| Timeline & Time | 6 | 10 | #c3-box | addClass is-lit | removeClass is-lit |
| Timeline & Time | 10 | 13 | #c3-beat-3 | addClass is-visible | removeClass is-visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #card-1 | Chapter 1 | navigate | Hub |
| click #card-2 | Chapter 2 | navigate | Hub |
| click #card-3 | Timeline & Time | navigate | Hub |
| click #back-1 | Hub | navigate | Chapter 1 |
| key Escape | Hub | navigate | Chapter 1 |
| key ArrowRight | 4 | seek | Chapter 1 |
| click #back-2 | Hub | navigate | Chapter 2 |
| key Escape | Hub | navigate | Chapter 2 |
| click #back-3 | Hub | navigate | Timeline & Time |
| key Escape | Hub | navigate | Timeline & Time |
| key space | - | toggle | Timeline & Time |
