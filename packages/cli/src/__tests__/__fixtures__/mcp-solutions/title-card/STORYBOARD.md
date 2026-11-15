# Storyboard: Title card

- audience: anyone opening the page, desktop
- provider: raf (no media; a 10-second timed title)
- languages: none
- assets: none
- host module: none

## view title (container #stage)

enter: wire #play and #pause
leave: remove both click listeners

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| title | 1 | 8 | #headline | addClass in | removeClass in |
| title | 3 | 8 | #subtitle | addClass is-up | removeClass is-up |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #play | - | play | title |
| click #pause | - | pause | title |
