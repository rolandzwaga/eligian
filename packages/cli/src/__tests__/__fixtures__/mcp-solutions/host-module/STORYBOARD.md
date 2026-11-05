# Storyboard: Quiz

- audience: visitors of the quiz page, desktop and phone
- provider: raf (no media; the result panel is timed)
- languages: none
- assets: none
- host module: host.ts, the operation score(answer) that writes the message into #result

## view quiz (container #stage)

enter: pause at 0 until an answer, wire #answer-a, #answer-b and #answer-c
leave: remove the three answer listeners

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| quiz | 1 | 4 | #result | addClass is-shown | removeClass is-shown |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #answer-a | answer("a") | run | quiz |
| click #answer-b | answer("b") | run | quiz |
| click #answer-c | answer("c") | run | quiz |
