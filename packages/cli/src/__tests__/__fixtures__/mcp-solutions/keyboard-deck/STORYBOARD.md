# Storyboard: Twelve-slide deck

- audience: a talk on a projector, the speaker on a keyboard
- provider: raf (no media; each slide is a view the keys navigate between)
- languages: none
- assets: none
- host module: none

Every slide is the same view shape: its own timeline in `#deck`, `slide-1` first. A slide's on enter shows it, writes `<n> / 12` into `#counter` and binds its keys on `#deck`; its on leave hides it and removes one KeyboardController from `#deck` per key. `slide-1` has no ArrowLeft and no Home (it is slide 1), `slide-12` no ArrowRight.

## view slide-1 (container #deck)

enter: show #slide-1, write `1 / 12` into #counter, bind the keys on #deck
leave: hide #slide-1, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-1 | 0 | 1 | #slide-1 | addClass is-entering | removeClass is-entering |

## view slide-2 (container #deck)

enter: show #slide-2, write `2 / 12` into #counter, bind the keys on #deck
leave: hide #slide-2, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-2 | 0 | 1 | #slide-2 | addClass is-entering | removeClass is-entering |

## view slide-3 (container #deck)

enter: show #slide-3, write `3 / 12` into #counter, bind the keys on #deck
leave: hide #slide-3, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-3 | 0 | 1 | #slide-3 | addClass is-entering | removeClass is-entering |

## view slide-4 (container #deck)

enter: show #slide-4, write `4 / 12` into #counter, bind the keys on #deck
leave: hide #slide-4, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-4 | 0 | 1 | #slide-4 | addClass is-entering | removeClass is-entering |

## view slide-5 (container #deck)

enter: show #slide-5, write `5 / 12` into #counter, bind the keys on #deck
leave: hide #slide-5, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-5 | 0 | 1 | #slide-5 | addClass is-entering | removeClass is-entering |

## view slide-6 (container #deck)

enter: show #slide-6, write `6 / 12` into #counter, bind the keys on #deck
leave: hide #slide-6, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-6 | 0 | 1 | #slide-6 | addClass is-entering | removeClass is-entering |

## view slide-7 (container #deck)

enter: show #slide-7, write `7 / 12` into #counter, bind the keys on #deck
leave: hide #slide-7, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-7 | 0 | 1 | #slide-7 | addClass is-entering | removeClass is-entering |

## view slide-8 (container #deck)

enter: show #slide-8, write `8 / 12` into #counter, bind the keys on #deck
leave: hide #slide-8, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-8 | 0 | 1 | #slide-8 | addClass is-entering | removeClass is-entering |

## view slide-9 (container #deck)

enter: show #slide-9, write `9 / 12` into #counter, bind the keys on #deck
leave: hide #slide-9, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-9 | 0 | 1 | #slide-9 | addClass is-entering | removeClass is-entering |

## view slide-10 (container #deck)

enter: show #slide-10, write `10 / 12` into #counter, bind the keys on #deck
leave: hide #slide-10, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-10 | 0 | 1 | #slide-10 | addClass is-entering | removeClass is-entering |

## view slide-11 (container #deck)

enter: show #slide-11, write `11 / 12` into #counter, bind the keys on #deck
leave: hide #slide-11, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-11 | 0 | 1 | #slide-11 | addClass is-entering | removeClass is-entering |

## view slide-12 (container #deck)

enter: show #slide-12, write `12 / 12` into #counter, bind the keys on #deck
leave: hide #slide-12, remove one KeyboardController per key from #deck

| timeline | start | end | selector | change | end-block |
| --- | --- | --- | --- | --- | --- |
| slide-12 | 0 | 1 | #slide-12 | addClass is-entering | removeClass is-entering |

## interactions

| trigger | target | verb | timeline |
| --- | --- | --- | --- |
| key ArrowRight | slide-2 | navigate | slide-1 |
| key ArrowRight | slide-3 | navigate | slide-2 |
| key ArrowLeft | slide-1 | navigate | slide-2 |
| key Home | slide-1 | navigate | slide-2 |
| key ArrowRight | slide-4 | navigate | slide-3 |
| key ArrowLeft | slide-2 | navigate | slide-3 |
| key Home | slide-1 | navigate | slide-3 |
| key ArrowRight | slide-5 | navigate | slide-4 |
| key ArrowLeft | slide-3 | navigate | slide-4 |
| key Home | slide-1 | navigate | slide-4 |
| key ArrowRight | slide-6 | navigate | slide-5 |
| key ArrowLeft | slide-4 | navigate | slide-5 |
| key Home | slide-1 | navigate | slide-5 |
| key ArrowRight | slide-7 | navigate | slide-6 |
| key ArrowLeft | slide-5 | navigate | slide-6 |
| key Home | slide-1 | navigate | slide-6 |
| key ArrowRight | slide-8 | navigate | slide-7 |
| key ArrowLeft | slide-6 | navigate | slide-7 |
| key Home | slide-1 | navigate | slide-7 |
| key ArrowRight | slide-9 | navigate | slide-8 |
| key ArrowLeft | slide-7 | navigate | slide-8 |
| key Home | slide-1 | navigate | slide-8 |
| key ArrowRight | slide-10 | navigate | slide-9 |
| key ArrowLeft | slide-8 | navigate | slide-9 |
| key Home | slide-1 | navigate | slide-9 |
| key ArrowRight | slide-11 | navigate | slide-10 |
| key ArrowLeft | slide-9 | navigate | slide-10 |
| key Home | slide-1 | navigate | slide-10 |
| key ArrowRight | slide-12 | navigate | slide-11 |
| key ArrowLeft | slide-10 | navigate | slide-11 |
| key Home | slide-1 | navigate | slide-11 |
| key ArrowLeft | slide-11 | navigate | slide-12 |
| key Home | slide-1 | navigate | slide-12 |
