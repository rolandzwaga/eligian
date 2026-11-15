# Storyboard: Welcome

- audience: anyone opening the page, desktop and phone
- provider: raf (no media; the beats are timed text)
- languages: none
- assets: none
- host module: none

## view Main (container #stage)

enter: a progress bar on #stage, wire #next
leave: remove the progress bar and the #next listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Main | 0 | 3 | #hero | addClass visible | removeClass visible |
| Main | 3 | 6 | #banner | addClass visible | removeClass visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #next | - | play | Main |
