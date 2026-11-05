# Storyboard: Northwind intro

- audience: visitors of the landing page, desktop and phone
- provider: raf (no media; a 20 s timed intro)
- languages: none
- assets: none
- host module: none

## view intro (container #stage)

enter: wire #restart and #skip
leave: hide every beat, remove both click listeners

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| intro | 1 | 11 | #title | addClass is-visible | removeClass is-visible |
| intro | 5 | 11 | #tagline | addClass is-visible | removeClass is-visible |
| intro | 12 | 20 | #reveal | addClass is-visible | removeClass is-visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #restart | replay() | run | intro |
| click #skip | 12 | seek | intro |
