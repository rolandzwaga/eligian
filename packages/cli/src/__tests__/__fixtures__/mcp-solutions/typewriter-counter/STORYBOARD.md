# Storyboard: Typewriter and counter

- audience: visitors of a landing page, desktop and phone
- provider: raf (no media; 8 timed seconds)
- languages: none
- assets: none
- host module: none

## view typewriter (container #stage)

enter: nothing to set up; every state is a range
leave: nothing to undo

Ranges are half-open, so the end of the timeline (8s) lies outside all of them: the final state (the full sentence in #sentence, `250` in #counter, no caret) is the layout's own, and every end block restores it. `typeTo n` writes the first n characters of the sentence (a caret while n < 44); `countTo n` writes n × 25. The typing is one `stagger` of 44 ranges of 4s / 44 each, the count one of 10 ranges of 300ms.

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| typewriter | 0.000 | 0.091 | #sentence | typeTo 0 | typeTo 44 |
| typewriter | 0.091 | 0.182 | #sentence | typeTo 1 | typeTo 44 |
| typewriter | 0.182 | 0.273 | #sentence | typeTo 2 | typeTo 44 |
| typewriter | 0.273 | 0.364 | #sentence | typeTo 3 | typeTo 44 |
| typewriter | 0.364 | 0.455 | #sentence | typeTo 4 | typeTo 44 |
| typewriter | 0.455 | 0.545 | #sentence | typeTo 5 | typeTo 44 |
| typewriter | 0.545 | 0.636 | #sentence | typeTo 6 | typeTo 44 |
| typewriter | 0.636 | 0.727 | #sentence | typeTo 7 | typeTo 44 |
| typewriter | 0.727 | 0.818 | #sentence | typeTo 8 | typeTo 44 |
| typewriter | 0.818 | 0.909 | #sentence | typeTo 9 | typeTo 44 |
| typewriter | 0.909 | 1.000 | #sentence | typeTo 10 | typeTo 44 |
| typewriter | 1.000 | 1.091 | #sentence | typeTo 11 | typeTo 44 |
| typewriter | 1.091 | 1.182 | #sentence | typeTo 12 | typeTo 44 |
| typewriter | 1.182 | 1.273 | #sentence | typeTo 13 | typeTo 44 |
| typewriter | 1.273 | 1.364 | #sentence | typeTo 14 | typeTo 44 |
| typewriter | 1.364 | 1.455 | #sentence | typeTo 15 | typeTo 44 |
| typewriter | 1.455 | 1.545 | #sentence | typeTo 16 | typeTo 44 |
| typewriter | 1.545 | 1.636 | #sentence | typeTo 17 | typeTo 44 |
| typewriter | 1.636 | 1.727 | #sentence | typeTo 18 | typeTo 44 |
| typewriter | 1.727 | 1.818 | #sentence | typeTo 19 | typeTo 44 |
| typewriter | 1.818 | 1.909 | #sentence | typeTo 20 | typeTo 44 |
| typewriter | 1.909 | 2.000 | #sentence | typeTo 21 | typeTo 44 |
| typewriter | 2.000 | 2.091 | #sentence | typeTo 22 | typeTo 44 |
| typewriter | 2.091 | 2.182 | #sentence | typeTo 23 | typeTo 44 |
| typewriter | 2.182 | 2.273 | #sentence | typeTo 24 | typeTo 44 |
| typewriter | 2.273 | 2.364 | #sentence | typeTo 25 | typeTo 44 |
| typewriter | 2.364 | 2.455 | #sentence | typeTo 26 | typeTo 44 |
| typewriter | 2.455 | 2.545 | #sentence | typeTo 27 | typeTo 44 |
| typewriter | 2.545 | 2.636 | #sentence | typeTo 28 | typeTo 44 |
| typewriter | 2.636 | 2.727 | #sentence | typeTo 29 | typeTo 44 |
| typewriter | 2.727 | 2.818 | #sentence | typeTo 30 | typeTo 44 |
| typewriter | 2.818 | 2.909 | #sentence | typeTo 31 | typeTo 44 |
| typewriter | 2.909 | 3.000 | #sentence | typeTo 32 | typeTo 44 |
| typewriter | 3.000 | 3.091 | #sentence | typeTo 33 | typeTo 44 |
| typewriter | 3.091 | 3.182 | #sentence | typeTo 34 | typeTo 44 |
| typewriter | 3.182 | 3.273 | #sentence | typeTo 35 | typeTo 44 |
| typewriter | 3.273 | 3.364 | #sentence | typeTo 36 | typeTo 44 |
| typewriter | 3.364 | 3.455 | #sentence | typeTo 37 | typeTo 44 |
| typewriter | 3.455 | 3.545 | #sentence | typeTo 38 | typeTo 44 |
| typewriter | 3.545 | 3.636 | #sentence | typeTo 39 | typeTo 44 |
| typewriter | 3.636 | 3.727 | #sentence | typeTo 40 | typeTo 44 |
| typewriter | 3.727 | 3.818 | #sentence | typeTo 41 | typeTo 44 |
| typewriter | 3.818 | 3.909 | #sentence | typeTo 42 | typeTo 44 |
| typewriter | 3.909 | 4.000 | #sentence | typeTo 43 | typeTo 44 |
| typewriter | 4 | 8 | #sentence | typeTo 44 | typeTo 44 |
| typewriter | 0 | 4 | #counter | countTo 0 | countTo 10 |
| typewriter | 4.0 | 4.3 | #counter | countTo 0 | countTo 10 |
| typewriter | 4.3 | 4.6 | #counter | countTo 1 | countTo 10 |
| typewriter | 4.6 | 4.9 | #counter | countTo 2 | countTo 10 |
| typewriter | 4.9 | 5.2 | #counter | countTo 3 | countTo 10 |
| typewriter | 5.2 | 5.5 | #counter | countTo 4 | countTo 10 |
| typewriter | 5.5 | 5.8 | #counter | countTo 5 | countTo 10 |
| typewriter | 5.8 | 6.1 | #counter | countTo 6 | countTo 10 |
| typewriter | 6.1 | 6.4 | #counter | countTo 7 | countTo 10 |
| typewriter | 6.4 | 6.7 | #counter | countTo 8 | countTo 10 |
| typewriter | 6.7 | 7.0 | #counter | countTo 9 | countTo 10 |
| typewriter | 7 | 8 | #counter | countTo 10 | countTo 10 |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
