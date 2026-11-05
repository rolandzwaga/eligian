# Storyboard: Intro with subtitles

- audience: visitors of the intro page, desktop and phone
- provider: video (the recorded intro; its playback position drives the captions), behind a raf Start view whose click is the play gesture
- languages: none
- assets: media/intro.mp4
- host module: none

## view Start (container #stage)

enter: show #start-view, wire #start
leave: hide #start-view, remove the #start listener

## view Video (container #player)

enter: show #video-view, add the ProgressbarController to the fill inside the #progress bar
leave: hide #video-view, remove the ProgressbarController

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Video | 2 | 7 | #caption-1 | addClass is-visible | removeClass is-visible |
| Video | 8 | 13 | #caption-2 | addClass is-visible | removeClass is-visible |
| Video | 14 | 19 | #caption-3 | addClass is-visible | removeClass is-visible |
| Video | 20 | 25 | #caption-4 | addClass is-visible | removeClass is-visible |
| Video | 26 | 29 | #caption-5 | addClass is-visible | removeClass is-visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #start | Video | navigate | Start |
