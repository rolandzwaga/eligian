# Storyboard: Eligian title

- audience: anyone opening the page, desktop and phone
- provider: raf (no media; the beats are timed text)
- languages: none
- assets: none
- host module: none

## view main (container #stage)

enter: nothing to set up
leave: nothing to remove

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| main | 0 | 3 | #title | addClass visible | removeClass visible |
| main | 3 | 6 | #title | addClass highlight | removeClass highlight |
| main | 3 | 6 | #subtitle | addClass visible | removeClass visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
