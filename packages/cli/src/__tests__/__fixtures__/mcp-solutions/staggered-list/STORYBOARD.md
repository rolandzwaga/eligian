# Storyboard: Feature cards

- audience: visitors of the features page, desktop and phone
- provider: raf (no media; a 6-second timed reveal)
- languages: none
- assets: none
- host module: none

## view features (container #stage)

enter: nothing to set up
leave: nothing to remove

Each card's own range shows it from its stagger start; from 2s, when the sixth card is in, `#cards` carries `is-complete`, which keeps every card visible to the end.

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| features | 0 | 4 | #card-1 | addClass is-visible | removeClass is-visible |
| features | 0.4 | 4.4 | #card-2 | addClass is-visible | removeClass is-visible |
| features | 0.8 | 4.8 | #card-3 | addClass is-visible | removeClass is-visible |
| features | 1.2 | 5.2 | #card-4 | addClass is-visible | removeClass is-visible |
| features | 1.6 | 5.6 | #card-5 | addClass is-visible | removeClass is-visible |
| features | 2 | 6 | #card-6 | addClass is-visible | removeClass is-visible |
| features | 2 | 6 | #cards | addClass is-complete | removeClass is-complete |
| features | 2 | 4 | #card-3 | addClass highlight | removeClass highlight |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
