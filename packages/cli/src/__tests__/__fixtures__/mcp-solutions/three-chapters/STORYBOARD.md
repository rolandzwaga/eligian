# Storyboard: Our product story

- audience: prospects on the product page, desktop and phone
- provider: raf (no media; the chapters are timed text)
- languages: en-US (default), nl-NL
- assets: none
- host module: none

## view Hub (container #stage)

enter: show #hub, label #hub-title, wire the three chapter buttons and the language toggle
leave: hide #hub, remove the #hub-title label and every click listener

## view Problem (container #stage)

enter: show #problem, label its title and text, wire #back-problem
leave: hide #problem, remove both labels and the #back-problem listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Problem | 0 | 8 | #problem-title | addClass is-visible | removeClass is-visible |
| Problem | 1 | 8 | #problem-text | addClass is-visible | removeClass is-visible |

## view Solution (container #stage)

enter: show #solution, label its title and text, wire #back-solution
leave: hide #solution, remove both labels and the #back-solution listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Solution | 0 | 8 | #solution-title | addClass is-visible | removeClass is-visible |
| Solution | 1 | 8 | #solution-text | addClass is-visible | removeClass is-visible |

## view Results (container #stage)

enter: show #results, label its title and text, wire #back-results
leave: hide #results, remove both labels and the #back-results listener

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| Results | 0 | 8 | #results-title | addClass is-visible | removeClass is-visible |
| Results | 1 | 8 | #results-text | addClass is-visible | removeClass is-visible |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| click #to-problem | Problem | navigate | Hub |
| click #to-solution | Solution | navigate | Hub |
| click #to-results | Results | navigate | Hub |
| click #lang-nl | setLanguage("nl-NL") | run | Hub |
| click #lang-en | setLanguage("en-US") | run | Hub |
| click #back-problem | Hub | navigate | Problem |
| click #back-solution | Hub | navigate | Solution |
| click #back-results | Hub | navigate | Results |
