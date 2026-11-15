# Storyboard: Animation showcase

- audience: developers browsing the animation library, desktop
- provider: raf (no media; 15 timed seconds)
- languages: none
- assets: none
- host module: none; the animations are the library `lib/animations.eligian` (fadeIn, fadeOut, slideIn), imported by main.eligian

## view showcase (container #stage)

enter: nothing to set up; every beat is a range
leave: nothing to undo

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| showcase | 1 | 12 | #title | fadeIn (addClass fade-in) | removeClass fade-in |
| showcase | 4 | 15 | #panel-left | slideIn from-left (addClass slide-in, from-left) | removeClass slide-in, from-left |
| showcase | 7 | 15 | #panel-right | slideIn from-right (addClass slide-in, from-right) | removeClass slide-in, from-right |
| showcase | 12 | 15 | #title | fadeOut (removeClass fade-in, addClass fade-out) | removeClass fade-out |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
