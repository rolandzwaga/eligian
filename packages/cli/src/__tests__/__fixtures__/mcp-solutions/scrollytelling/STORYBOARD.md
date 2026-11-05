# Storyboard: Scroll explainer

- audience: readers of a long-form article, desktop and phone
- provider: scroll (the reader's scrolling of #article is the time: its 4000px of content map onto 100s)
- languages: none
- assets: none
- host module: none

## view story (container #stage)

enter: nothing to set up; the illustrations and the heading are beats
leave: nothing to undo

Ranges are half-open, so no range covers the very end of the article (100s). The end state is the layout's own (every illustration visible, the heading `Where it goes next`); each beat covers a state before it and its end block restores the end state.

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| story | 0 | 15 | #illustration-1 | addClass is-ahead | removeClass is-ahead |
| story | 0 | 40 | #illustration-2 | addClass is-ahead | removeClass is-ahead |
| story | 0 | 65 | #illustration-3 | addClass is-ahead | removeClass is-ahead |
| story | 0 | 90 | #illustration-4 | addClass is-ahead | removeClass is-ahead |
| story | 0 | 40 | #heading | setElementContent Where it begins | setElementContent Where it goes next |
| story | 40 | 65 | #heading | setElementContent The turning point | setElementContent Where it goes next |
| story | 65 | 90 | #heading | setElementContent What it changed | setElementContent Where it goes next |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
