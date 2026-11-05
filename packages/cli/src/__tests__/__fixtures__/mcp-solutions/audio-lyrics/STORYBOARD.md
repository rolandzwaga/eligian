# Storyboard: Sing along

- audience: visitors of the song page, desktop and phone
- provider: audio (the song's playback position drives the highlighted line)
- languages: none
- assets: media/song.mp3
- host module: none

## view Start (container #stage)

enter: show #intro, wire #start
leave: hide #intro, remove the #start listener

## view Song (container #player)

enter: show #lyrics, wire #line-1 to #line-5
leave: hide #lyrics, remove the five line listeners

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Song | 1 | 4 | #line-1 | addClass active | removeClass active |
| Song | 4 | 8 | #line-2 | addClass active | removeClass active |
| Song | 8 | 12 | #line-3 | addClass active | removeClass active |
| Song | 12 | 16 | #line-4 | addClass active | removeClass active |
| Song | 16 | 19 | #line-5 | addClass active | removeClass active |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #start | Song | navigate | Start |
| click #line-1 | 1 | seek | Song |
| click #line-2 | 4 | seek | Song |
| click #line-3 | 8 | seek | Song |
| click #line-4 | 12 | seek | Song |
| click #line-5 | 16 | seek | Song |
