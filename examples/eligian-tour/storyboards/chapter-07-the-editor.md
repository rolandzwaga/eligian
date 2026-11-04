# Storyboard — Chapter 7: The Editor

> Teaches the **VS Code extension**, one beat per feature: install, diagnostics and Problems, CSS and selector
> checks with their quick fixes, dataflow errors with *Insert selectElement* / *Add target*, completion, signature
> help and inlay hints, hovers and the JSDoc template, navigation (Go to Definition, references, the CSS CodeLens,
> rename, the navigate-target fixes), the Outline, snippets / Format Document / block labels / the range refactor,
> the preview, runtime errors and Eligius lint, the Timeline view, the Locale Editor / New Presentation / Compile
> Current File, and the ten settings.
>
> **⚠ This chapter is different from 1–6.** Those taught language and engine features the running presentation
> genuinely uses. This chapter's subject is the **editor**: it lives in VS Code, not in the Eligius engine, so a
> running timeline **cannot exercise it**. The effect pane is a **reenactment**: a CSS-built mock of VS Code, one
> frame per beat, whose every string is copied from the real providers or captured with `eligian check` and the real
> LSP providers (sources per beat in §1 and §3). The narration says so in beat 1. The genuine dogfood is *historical*:
> this tour was written with exactly these tools. The one live tie-in: opened through *Eligian: Preview Timeline*,
> beat 11's preview is what the viewer is looking at.

---

## 0. Stage layout (shared)

Same per-chapter-view architecture as Chapter 1 (see `chapter-01-timeline-and-time.md` §0): `#ch6` is a
`section.view.chapter` inside `#stage` with its own `header.chrome` (back button `#c6-to-hub`, an 8-dot progress rail
with dot 7 current, the label `07 · The Editor`), `section.code-pane` of pre-tokenized `pre#c6-code-*.code` blocks,
`section.effect-pane` of `div#c6-fx-*.fx` panels and a `div.callout-layer` of `div#c6-cl-e1` … `#c6-cl-e15` chips.
The shared `#narration` and `#progress` sit outside the views. The view keeps its id `#ch6` and the `c6-` prefix; the
display number (07) follows the hub order. The timeline is `"The Editor"` (it was `"Tooling Magic"`).

**Ids and classes:** ids come from `layout.html`, classes from `tour.css`; both are checked, also through action
parameters (spec 056). That includes the selectors this chapter passes to the library (`revealBlock`, `demo`,
`revealCard`, …): `revealCard("#c6-fx-hints .ide-inlay")` is validated per component, the id against the layout and
the class against the CSS.

**View management:** the chapter shows and hides its view only through its lifecycle blocks:
`on enter [ enterChapter("#ch6") … ]` shows the view and the narration and attaches the ProgressbarController to
`#progress-fill`; `on leave [ leaveChapter("#ch6", "#c6-to-hub") ]` hides them, resets the view (`resetChapter`:
removes `.in`, `.typing`, `.active`, `.show`, `.spot`, `.lit`, `.muted` inside it, so every popup is hidden again) and
removes every controller of the skeleton (three KeyboardControllers on `#stage`, the back button's listener, the
ProgressbarController). The chapter attaches nothing else. Hub card `#card-ch6` (and key `7`) `navigate`s to
`"The Editor"`.

### Shared actions

Reuses the library unchanged (`revealBlock`, `spotlight`, `clearSpots`, `callout`, `narrate`, `demo`, `revealCard`,
and the chapter skeleton's `enterChapter`, `replayChapter`, `leaveChapter`; table in
`chapter-01-timeline-and-time.md` §0). **No chapter-local actions:** there is no editor at runtime to drive, and
every interaction with a frame is a class (`demo` adds `.active` to a frame, `revealCard` adds `.in` to a popup).

### Effect-pane motif: a mock IDE

One frame per beat, `div#c6-fx-<beat>.fx.ide`, revealed by `demo()` like any `.fx` panel. Popups and panels inside a
frame are `.ide-pop` (hidden: `opacity: 0`, lowered 4px) and appear with their own `.ide-pop.in` rule (the state-class
rule of `tour.css`: a two-class hidden state needs its own reveal rule), added by timed sub-step events after the
sequence: `at eK.start + Ns for Ms [ revealCard("#c6-pop-…") ]`. The classes live in the `/* ---- Mock IDE ---- */`
section of `tour.css` (which replaced the old `.mock-*` / `.complete-*` rules; `.squiggle`, `.diagnostic` and
`.hover-card` stay in the shared mock-UI section):

| Class | Purpose |
|---|---|
| `.ide` (with `.fx.ide`) | the frame: `#0b0f14`, 1px `#30363d` border, radius 8, monospace 0.78rem; `.fx.ide` resets `.fx`'s centring and padding |
| `.ide-titlebar`, `.ide-tab`, `.ide-tab.is-active` | tab strip; the active tab has the accent underline |
| `.ide-editor`, `.ide-line`, `.ide-line.is-current`, `.ide-gutter` | editor lines (`white-space: pre`); the line number is a `.ide-gutter` span inside its line, so popups can sit between lines |
| `.ide-caret` | 1px accent bar, `caret-blink` (off under `prefers-reduced-motion`) |
| `.ide-pop`, `.ide-pop.in` | a hidden popup and its reveal |
| `.ide-hover`, `.ide-signature`, `.ide-lightbulb`, `.ide-bulb` | hover card (diagnostic + markdown), signature help (active parameter bold), quick-fix menu |
| `.ide-complete`, `.ide-complete-item(.is-sel)`, `.ide-complete-detail`, `.ide-columns` | completion lists (the old `.complete-*` renamed), side by side |
| `.ide-inlay`, `.ide-blocklabel`, `.ide-lens`, `.ide-selection` | inlay hint chip, `ˢᵉᵗᵘᵖ` / `ᵗᵉᵃʳᵈᵒʷⁿ` decoration, CodeLens line, a selected snippet placeholder |
| `.ide-panel`, `.ide-panel-title`, `.ide-count`, `.ide-problems`, `.ide-problem`, `.ide-x`, `.ide-dim` | the Problems panel |
| `.ide-palette`, `.ide-palette-item(.is-sel)`, `.ide-filter` | command palette, quick pick, references peek |
| `.ide-outline`, `.ide-outline-item[data-depth]` | the Outline tree |
| `.ide-preview`, `.ide-preview-controls`, `.ide-button`, `.ide-select`, `.ide-scrubber(-knob)`, `.ide-preview-stage`, `.ide-debug`, `.ide-debug-event`, `.ide-preview-errors`, `.ide-toast` | the preview webview (controls of `preview.html`), the EventBus Debug Viewer, Compilation Errors, a notification toast |
| `.ide-gantt`, `.ide-gantt-track`, `.ide-gantt-axis`, `.ide-lane`, `.ide-bar(.sequence/.stagger)`, `.ide-playhead` | the Timeline view: lanes of 22px, bars at `left` / `width` percentages, a playhead (`#c6-gantt-playhead.in` moves it from 20 s to 24 s) |
| `.ide-locale`, `.ide-locale-tree`, `.ide-locale-table` | the Locale Editor: key tree and the selected key's table |
| `.ide-status` | status bar (accent background) |

---

## 1. Segment beats

The beats play on the raf clock; `space` pauses and resumes, `r` replays the chapter (`replayChapter`: reset the
view, then seek to 0), `Esc` or `← Hub` go back to the hub. A beat = narration swap + code block + spotlight +
callout + frame; the sub-steps reveal the frame's popups one after the other. The chapter is one sequence of labelled
items followed by the sub-step events:

```eligian
timeline "The Editor" in "#stage" using raf {
  on enter [
    enterChapter("#ch6")
    on click "#c6-to-hub" navigate "Hub"
    on key "Escape" navigate "Hub"
    on key "space" toggle
    on key "r" run replayChapter("#ch6")
  ]
  on leave [
    leaveChapter("#ch6", "#c6-to-hub")
  ]

  sequence each [ clearSpots() ] {
    for 8s as e1 [ … ]         // beat 1
    for 7s as e2 [ … ]
    …
    for 7s as e15 [ … ]        // beat 15
  }

  at e2.start + 2s for 5s [ revealCard("#c6-pop-problems") ]
  at e3.start + 2s for 5s [ revealCard("#c6-pop-css-diag") ]
  …
  at e14.start + 5.5s for 1.5s [ revealCard("#c6-pop-langblock") ]
}
```

8 + 14 × 7 = **106 s**, the timeline's duration, which the ProgressbarController reads. The labels `e1` … `e15` are
scoped to this timeline; the sub-steps follow the sequence because only earlier events' labels can be referenced.
Every quoted string below was re-captured for this chapter (§3): diagnostics with `node packages/cli/bin/cli.js check`
on scratch files outside `examples/`, completion / hover / signature help / inlay hints / code actions / symbols /
Gantt bars / CSS lenses with the real providers (`services.Eligian.lsp.*`, `timelineGantt`, `cssReferenceLenses`) on
a copy of the tour. Where VS Code shows a diagnostic's source and code it reads `source(code)`; the validators that put
their code only in the diagnostic's `data` (parse errors, CSS checks, `setData` targets, navigate targets) show the
source alone (`eligian`).

### Beat 1 — install (0–8 s, `as e1`)

- **Narration:** "The other half of Eligian is the editor. Install the extension and every .eligian file gets
  highlighting, checking, completion, hover, a preview — all of which wrote this tour. What follows is a mock-up with
  the real texts."
- **Code** `#c6-code-why`: `code --install-extension rolandzwaga.eligian` / `// Marketplace: eligian · publisher
  rolandzwaga · activates on .eligian files`.
- **Spot / callout:** `#c6-tok-why` (the extension id); `#c6-cl-e1` "one extension: highlighting, diagnostics,
  completion, hovers, preview, Timeline view, Locale Editor".
- **Frame** `#c6-fx-editor`: tabs `tour.eligian` · `presentation.eligian` · `tour.css`; the tour's own lines 25–31
  (`languages { … }`, `layout`, `styles`); status `⊗ 0 ⚠ 0` · `Ln 31, Col 20` · `Eligian`.
- **Source:** `packages/extension/package.json` (`name: eligian`, `publisher: rolandzwaga`, `activationEvents:
  onLanguage:eligian`).

### Beat 2 — validation + Problems (8–15 s, `as e2`)

- **Narration:** "Syntax errors speak plainly, and every semantic rule — imports, names, arguments, events, timelines —
  lands in Problems while you type."
- **Code** `#c6-code-syntax`:
  ```eligian
  action loop() [ selectElement("#hub") ]
  action store() [ setData({ "operationdata.k": 1 }) ]
  timeline "T" in "#stage" using raf {
    at 0s..5s { intro() }
  }
  ```
- **Spot / callout:** `#c6-tok-syntax` (the `{`); `#c6-cl-e2` "one line per syntax error: a keyword used as a name is
  explained, expected tokens read as words".
- **Frame** `#c6-fx-problems`: the snippet as lines 4–8 of `demo.eligian` (line 3 is `action intro() [ … ]`), with
  squiggles under `loop`, `"operationdata.k"`, `{` and the closing `}`; +2 s the Problems panel (`#c6-pop-problems`,
  `PROBLEMS 4`), in position order:
  - `'loop' is a keyword, so it cannot be used as a name here. Choose another name.` `eligian [Ln 4, Col 8]`
  - `setData target 'operationdata.k' needs a '$' prefix: '$operationdata.k'. Eligius rejects 'operationdata.k' at
    runtime` `eligian [Ln 5, Col 28]`
  - `Expected an action or operation call, or a [ … ] block here, but found '{'.` `eligian [Ln 7, Col 13]`
  - `Unexpected '}': expected the end of the file (or a timeline, action, constant or import).` `eligian [Ln 8, Col 1]`
- **Source:** `eligian-parser-error-provider.ts`, `validators/operation-call/set-data-validator.ts`; `eligian check`
  on the file gives exactly these four (codes `parsing-error` ×3, `invalid_setdata_target`).

### Beat 3 — CSS & selectors (15–22 s, `as e3`) ⭐

- **Narration:** "Every class and selector is checked against your CSS and your layout — even when it travels through
  an action parameter. Typo one: a squiggle, a suggestion, a one-click fix."
- **Code** `#c6-code-css`:
  ```eligian
  styles "./tour.css"
  action mark() [
    selectElement("#hub")
    addClass("activ")              // class: must be in the CSS
    spotlight("#tok-timelin")      // selector through a parameter: CSS ∪ layout
  ]
  ```
- **Spot / callout:** `#c6-tok-css` (`"activ"`); `#c6-cl-e3` "CSS ∪ layout for selectors; CSS only for class names ·
  eligian.validation.selectorNotInLayout".
- **Frame** `#c6-fx-css`: lines 4–8 of `demo.eligian` (against the tour's `layout.html` and `tour.css`), squiggles under
  `activ` and `#tok-timelin`; Problems `Unknown CSS class: 'activ'. Did you mean: active?` `eligian [Ln 6, Col 12]` and
  `Unknown CSS ID in selector: 'tok-timelin'. Did you mean: tok-timeline?` `eligian [Ln 7, Col 13]`; +2 s the hover
  `Unknown CSS class: 'activ'. Did you mean: active? eligian`; +4 s the lightbulb `Change to 'active'` / `Create
  '.activ' in tour.css`.
- **Accuracy:** the class is a typo of a class tour.css really has (`active`), so the suggestion is real; `Open CSS file`
  is the follow-up command of the create fix, not a menu entry. `spotlight` is a library action: the selector role of
  its parameter is inferred (spec 056), so the literal is checked at the call site.
- **Source:** `validators/operation-call/css-parameter-validator.ts:52`, `css/selector-validation.ts`,
  `css/did-you-mean-fix.ts:49`, `css/css-code-actions.ts:127`; codes `unknown_css_class`,
  `unknown_css_id_in_selector` (in the diagnostic data).

### Beat 4 — dataflow + quick fix (22–29 s, `as e4`)

- **Narration:** "The dataflow check knows what each block carries. A missing selected element gets a fix: Insert
  selectElement, or Add target."
- **Code** `#c6-code-dataflow`:
  ```eligian
  action highlight(selector) [ addClass("on") ]
  at 1s..2s highlight("#box")
  at 3s..4s [ addClass("on") ] [ selectElement("#box") removeClass("on") ]
  ```
- **Spot / callout:** `#c6-tok-dataflow` (the call); `#c6-cl-e4` "an action's hover lists what it needs from the
  caller".
- **Frame** `#c6-fx-dataflow`: lines 3–7 of `demo.eligian` (its own layout with `#box` and a stylesheet with `.on`, so
  only the dataflow errors remain); Problems:
  - `Action 'highlight' requires 'selectedElement' (used by addClass in 'highlight'), which is not available here -
    ensure it is created before calling 'highlight' (for example with selectElement)`
    `eligian(missing-action-dependency) [Ln 5, Col 13]`
  - `Property 'selectedElement' is not available - ensure it is created by a previous operation (for example with
    selectElement)` `eligian(missing-dependency) [Ln 6, Col 15]`

  +2 s the call's hover: the first message, then the hover markdown `### highlight` / `` `highlight(selector)` `` /
  `**Requires from the caller** (operationData):` / `` - `selectedElement` (used by addClass) ``; +4 s the fixes
  `Add target "#box"` (on the call, from its selector argument) and `Insert selectElement("#box")` (on the block,
  guessed from the end block's `selectElement`).
- **Source:** `dataflow/operation-dataflow.ts:508`, `lsp/select-element-fix.ts:43-84,111,138`,
  `eligian-hover-provider.ts:264`.

### Beat 5 — completion (29–36 s, `as e5`)

- **Narration:** "Type and the editor knows what fits: operations, your actions, controllers, CSS classes and ids, DOM
  events, keys, timeline names, label keys, even whole event skeletons."
- **Code** `#c6-code-complete` (typing states, not complete code; each list was taken from the provider at that place
  in a copy of the tour): `ani▎` · `rev▎` · `navigate "▎` · `on key "▎` · `addController("▎`.
- **Spot / callout:** `#c6-tok-complete`; `#c6-cl-e5` "the list depends on the place: a call, a navigate target, a key,
  a controller name".
- **Frame** `#c6-fx-complete`: after `ani` `animate (operation)` (detail `Eligius operation`), `animateWithClass
  (operation)`; after `rev` `revealBlock (action)` (detail `(selector) - imported action`), `revealCard (action)`;
  +2 s after `on key "8" navigate "` the program's timelines `Hub` (detail `timeline (raf)`), `Timeline & Time`,
  `Actions`, `Logic`, `Timeline Power Tools`, `Files & Imports`, `Engine Reach`, `The Editor`, `The Command Line`;
  +4 s after `on key "` `ArrowRight` (detail `Right arrow`), `ArrowLeft`, `ArrowUp`, `ArrowDown`, `space`, `Enter`, `Escape`, and after
  `addController("` the nine controllers, `DOMEventListenerController` (detail `Controller:
  DOMEventListenerController(eventName, actions?, actionOperationData?)`) … `SubtitlesController`.
- **Accuracy:** `fadeIn` is not an operation; items filter on the bare name (`completion/operations.ts:60`,
  `completion/actions.ts:71`), so `revealBlock` is not in the `ani` list. CSS classes and ids, DOM events, label keys
  and the `on event` skeleton are named in the narration and the callout, not drawn.
- **Source:** `completion/operations.ts:58,63`, `completion/actions.ts:69-74`, `completion/controllers.ts`,
  `completion/key-completions.ts`, `eligian-completion-provider.ts`.

### Beat 6 — signature help + inlay hints (36–43 s, `as e6`)

- **Narration:** "Inside a call the signature follows your cursor; resolved times and parameter names sit in the code
  as inlay hints."
- **Code** `#c6-code-hints` (the tour's own lines): `broadcastEvent(["#c5-fx-panel"], "tour-ping")` / `for 7s as
  editBeat [ … ]` / `stagger 200ms […] at editBeat.end with revealCard() for 1.5s` / `timeline "Logic" in "#stage"
  using raf {`.
- **Spot / callout:** `#c6-tok-hints`; `#c6-cl-e6` "settings: eligian.inlayHints.*".
- **Frame** `#c6-fx-hints`: +2 s the signature `broadcastEvent(eventArgs: array, eventName: eventName, eventTopic?:
  string)` with `eventName: eventName` bold (the cursor is in the second argument: active parameter 1) and the
  operation's description; +4 s the inlay chips at the provider's positions: `eventArgs:` / `eventName:` before the
  arguments, `‹15s..22s›` after `for 7s`, `‹22s..23.9s ×3›` after the stagger, `‹64s›` before the Logic header's `{`.
- **Source:** `lsp/call-signature.ts:126-139` (`ParameterType:eventName` has no type mapping and reads `eventName`),
  `lsp/eligian-signature-help-provider.ts`, `lsp/eligian-inlay-hint-provider.ts:55,151,182,204`.

### Beat 7 — hover + JSDoc (43–50 s, `as e7`)

- **Narration:** "Hover anything: an operation's docs from Eligius, your action's JSDoc, the CSS rule behind a class.
  Type /** above an action and the template writes itself."
- **Code** `#c6-code-jsdoc`:
  ```eligian
  /**
   * Reveal a code block …
   * @param {string} selector CSS selector for the code block
   */
  action revealBlock(selector: string) [ … ]

  revealBlock()
  ```
- **Spot / callout:** `#c6-tok-jsdoc` (`/**`); `#c6-cl-e7` "call: the JSDoc · definition: what call sites are checked
  for · timeline: its header".
- **Frame** `#c6-fx-hover`: the **call** `revealBlock()` with its squiggle; the hover shows `Action 'revealBlock'
  expects 1 argument(s) but got 0. Expected: selector` `eligian(invalid_parameter_count)`, then `### revealBlock` /
  `Reveal a code block: fade it in, run the CSS clip-sweep "typing" effect, and scroll the code pane so the new block
  is in view.` / `**Parameters:**` / `` - `selector` (`string`) - CSS selector for the code block `` (no *Requires*
  section: revealBlock selects its own element); +1.5 s the **definition** hover on `action revealBlock` in
  `presentation.eligian` (no JSDoc there): `### revealBlock` / `**Parameters checked at call sites:**` /
  `` - `selector`: CSS selector (checked against the CSS and the layout) ``; +3 s the **timeline** hover on `timeline
  "Logic"`: `### Timeline "Logic"` / `- **Provider:** raf` / `` - **Container:** `#stage` `` / `- **Duration:**
  computed from the events when compiling` / `- **Loops:** no`; +4.5 s `/**` + Enter: ` * Description` (the snippet
  placeholder, selected) / ` * @param {string} selector`.
- **Accuracy:** the arg-count message is the validator's own; the call hover is the JSDoc markdown (the `{string}` type
  comes from presentation.eligian's JSDoc), the definition hover lists the parameter roles only, and the two never
  appear in one card. Operation hovers (Eligius' descriptions) and CSS class hovers are named in the narration only.
- **Source:** `jsdoc/jsdoc-formatter.ts:18-39`, `eligian-hover-provider.ts:55-65,196-212,238-241`,
  `hover/timeline-hover.ts:32-50`, `validators/parameter-validator.ts:56`, `jsdoc/jsdoc-template-generator.ts:60-76`
  (`${1:Description}`; command `eligian.generateJSDoc`).

### Beat 8 — navigation (50–57 s, `as e8`)

- **Narration:** "F12 jumps from navigate to the timeline, from a selector to the CSS rule or the layout element.
  Shift+F12 finds references across .eligian, CSS and HTML; F2 renames a timeline everywhere."
- **Code** `#c6-code-nav`:
  ```eligian
  on click "#card-ch3" navigate "Logic"      // F12 → timeline "Logic"
  spotlight("#tok-timeline")                 // F12 → tour.css · layout.html
  timeline "Logic" …                         // F2 renames every navigate
  on click "#card-ch3" navigate "Logik"      // ✗ → Change to "Logic" · Create timeline "Logik"
  ```
- **Spot / callout:** `#c6-tok-nav`; `#c6-cl-e8` "eligian.codeLens.cssReferences · Find Eligian References in CSS and
  HTML files".
- **Frame** `#c6-fx-nav`: tab `tour.css` with the rule `#tok-timeline { anchor-name: --cl-name; }`; +2 s its CodeLens
  `1 Eligian reference`; +4 s the context-menu entry `Eligian: Find Eligian References` and the reference
  `tour.eligian 210 spotlight("#tok-timeline")`; below, tab `tour.eligian` with `navigate "Logik"` squiggled and the
  diagnostic `Unknown navigate target: 'Logik'. No timeline with this name exists. Available timelines: 'Hub',
  'Timeline & Time', 'Actions', 'Logic', 'Timeline Power Tools', 'Files & Imports', 'Engine Reach', 'The Editor',
  'The Command Line'.`
  `eligian` (code `unknown_navigate_target` in the data); +5.5 s the fixes `Change to "Logic"` / `Create timeline
  "Logik"`.
- **Source:** `lsp/eligian-timeline-providers.ts`, `lsp/css-navigation.ts` (`cssReferenceLenses`),
  `packages/extension/src/extension/css-references/css-reference-features.ts:100` (the lens title),
  `validators/navigate-validator.ts:47`, `lsp/timeline-symbols.ts:191,206`.

### Beat 9 — outline (57–64 s, `as e9`)

- **Narration:** "The Outline lists timelines with their lifecycle blocks and events at their resolved times —
  Ctrl+Shift+O jumps to any beat."
- **Code** `#c6-code-outline`: `timeline "Logic" in "#stage" using raf {` / `  on enter [ … ]` / `  sequence each
  [ … ] { for 8s as b1 [ … ] … }`.
- **Spot / callout:** `#c6-tok-outline`; `#c6-cl-e9` "also the breadcrumbs and Go to Symbol".
- **Frame** `#c6-fx-outline`: the provider's symbols for the tour's Logic timeline: `timeline "Logic"` `raf ·
  0s..64s`, `on enter` `enterChapter, navigate, toggle, …`, `on leave` `leaveChapter`, `sequence 0s..64s ×8`; +2 s the
  items `0s..8s as b1` `"const names a value. Known at compile t…" · narrate, revealBlock, spotlight, …` … `24s..33s as
  b4` …, and the two badge sub-steps `at 28s..29s` / `at 30s..31s` `ch3Badge`.
- **Source:** `lsp/eligian-document-symbol-provider.ts:95-156`.

### Beat 10 — snippets, format, block labels (64–71 s, `as e10`)

- **Narration:** "Snippets scaffold an action, a timeline, a chapter. Format Document tidies whitespace only. And every
  start and end block is labelled in the margin; a range rewrites itself as start for duration in one click."
- **Code** `#c6-code-format`: `action f( selector:string )[` / `selectElement(selector)` / `  addClass( "on" )` / `]`
  → `// Shift+Alt+F →` → `action f(selector: string) [` / `  selectElement(selector)` / `  addClass("on")` / `]`
  (`eligian fmt` reformats the first into the second).
- **Spot / callout:** `#c6-tok-format`; `#c6-cl-e10` "the same rules as eligian fmt".
- **Frame** `#c6-fx-format`: +2 s the snippet picker after `chap`: `action` · `endable action` · `on event` ·
  `timeline` · `chapter` (selected, `Chapter timeline`) · `languages` · `library`; +4 s the block labels on
  `at 0s..4s ˢᵉᵗᵘᵖ[ showView("#hub") ] ᵗᵉᵃʳᵈᵒʷⁿ[ hideView("#hub") ]`; +5.5 s the refactor `Convert to '0s for 4s'`.
- **Source:** `packages/extension/snippets/eligian.json` (7 prefixes), `lsp/format-rules.ts`,
  `lsp/block-labels.ts`, `block-label-decoration-provider.ts:32,41`, `timeline/time-range-actions.ts:29-60`.

### Beat 11 — preview (71–78 s, `as e11`)

- **Narration:** "Ctrl+K V opens the preview: the real engine in a webview, recompiled on every save and keeping its
  place; CSS, layout, locale and host-module edits reload live. Scrub, pick a timeline or a language, or start from a
  line."
- **Code** `#c6-code-preview`: `> Eligian: Preview Timeline (Ctrl+K V)` / `▶ Preview from 24s` / `for 9s as b4 [ … ]
  ▶ 24s..33s` (Logic's beat 4).
- **Spot / callout:** `#c6-tok-preview`; `#c6-cl-e11` "eligian.preview.highlightActiveEvents ·
  eligian.codeLens.preview".
- **Frame** `#c6-fx-preview`: tab `Eligian Preview`; the controls `Play Pause Stop Restart Debug Events` and `☑ Keep
  position on reload`, the scrub row `Logic ▾`, the scrubber, `24.0s`, `en-US ▾`; +2 s the CodeLens `▶ Preview from
  24s`; +4 s the playhead highlight on `for 9s as b4 [` with `▶ 24s..33s`; +5.5 s the `EventBus Debug Viewer`
  (`Clear`, `Filter by name or topic...`) with one row `timeline-seek-request` and its args `[ 0 ]`, what `r`
  broadcasts (`replayChapter`); the row's time is illustrative.
- **Hot reload** (CSS / HTML / locales / host module) is **narration only**; no frame claims to show it.
- **Source:** `packages/extension/src/extension/preview/templates/preview.html:263-299`,
  `media/preview-dom.ts` (`renderDebugEvents`: name, `HH:MM:SS.mmm`, `JSON.stringify(args, null, 2)`),
  `lsp/eligian-code-lens-provider.ts:71-83`, `preview/playhead-decoration-provider.ts:27`, keybinding `ctrl+k v`.

### Beat 12 — runtime errors + lint (78–85 s, `as e12`)

- **Narration:** "An engine error during preview becomes a diagnostic on the operation that failed, with Go to Source;
  a compile error shows in the preview, with Retry Compilation. And Eligius' own lint runs 200 ms after you stop
  typing."
- **Code** `#c6-code-runtime`:
  ```eligian
  action boom() [ selectElement($globaldata.nowhere) addClass("on") ]
  action jump() [ selectElement("#box") scrollToElement("smooth", "nowhere") ]
  ```
- **Spot / callout:** `#c6-tok-runtime`; `#c6-cl-e12` "source 'eligius-runtime' / 'Eligius lint'; setting
  eligian.validation.eligiusLint".
- **Frame** `#c6-fx-runtime`: lines 3–4 of `demo.eligian` (`at 9s..10s boom()`, `at 11s..12s jump()` in a timeline
  `"Logic"`); the hover `Runtime error at 9s of 'Logic' (in 'boom'): selectElement: selector is either empty or not
  defined.` `eligius-runtime(runtime_error)`; +2 s the toast `Eligian Preview Runtime Error: selectElement: selector
  is either empty or not defined. (demo.eligian:3:17)` with `Go to Source`; +4 s Problems with that diagnostic and the
  lint **error** `scrollToElement: 'block' must be one of 'start', 'center', 'end', 'nearest', got 'nowhere'. (at
  actions[1].startOperations[1].operationData.block in the compiled JSON)` `Eligius lint(E120) [Ln 4, Col 39]`;
  +5.5 s the preview's `Compilation Errors` for beat 2's brace line in a file of its own: `❌ Error` / `5:13` /
  `Expected an action or operation call, or a [ … ] block here, but found '{'.` / `Hint: Check syntax against Eligian
  grammar` / `Line 5, Column 13` / `[ParseError]` / `Retry Compilation`.
- **Verified:** `eligian smoke` on the file reports `selectElement: selector is either empty or not defined.` at
  `3:17 — 'Logic' at 9s` (in `boom`), and `eligian check` the lint finding at `4:39` with the same message and path
  (the CLI's suffix is `(Eligius lint at …)`, the editor's `(at … in the compiled JSON)`). The preview's position
  (`at 9s`) is the playhead at the moment of the error. The compile error text is `formatError()` of the compiler's
  `ParseError`, which the CompilationService sends to the webview.
- **Source:** `preview/PreviewPanel.ts:774-807,840-842` (toast, diagnostic text, source `eligius-runtime`, code
  `runtime_error`, the `(in 'boom')` call chain), `compiler/eligian-map.ts` (`locateEngineError`),
  `lsp/eligius-lint-notifications.ts:23-55` (source `Eligius lint`, code `E120`, severity 1 for an error),
  `preview/CompilationService.ts:175-191`, `media/preview-dom.ts` (`renderErrorList`).

### Beat 13 — timeline view (85–92 s, `as e13`)

- **Narration:** "The Eligian panel draws each timeline as a Gantt chart: a bar per event at its resolved time, the
  preview's playhead moving through. Click a bar to jump to its source; double-click to preview from there."
- **Code** `#c6-code-gantt`: `> Eligian: Show Timeline View` / `sequence each [ … ] { for 7s as b1 [ … ]  for 8s as
  b2 [ … ] … }` / `stagger 200ms […] at editBeat.end with revealCard() for 1.5s`.
- **Spot / callout:** `#c6-tok-gantt`; `#c6-cl-e13` "bars named by their labels; stagger rows by their item".
- **Frame** `#c6-fx-gantt`: panel `ELIGIAN › TIMELINE`, file `tour.eligian`, header `timeline "Timeline Power Tools"`
  `raf · 0s..57s · on enter · on leave`, axis ticks every 10 s, four lanes: `b1` `b2` `editBeat` `b4` `b5` `waveBeat`
  `b7` (0–7, 7–15, 15–22, 22–31, 31–40, 40–49, 49–57 s), then `stagger 1/3 "#c4-card-1"` … `stagger 3/3 "#c4-card-3"`
  (22 s, 22.2 s, 22.4 s, 1.5 s each) and `stagger 1/3 "#c4-wave-1"` … `stagger 3/3 "#c4-wave-3"` (41 s, 41.15 s,
  41.3 s, 2 s each); +2 s the playhead moves from 20 s to 24 s (`#c6-gantt-playhead.in`).
- **Source:** `lsp/timeline-gantt.ts:34-60,119,132` (bars and lanes as captured), `media/timeline-view-render.ts`
  (header meta, `tickStep`, `left` / `width` percentages, lanes of 22px), `timeline-view/TimelineViewProvider.ts`.

### Beat 14 — locales, new presentation, compile (92–99 s, `as e14`)

- **Narration:** "Edit translations in the Locale Editor — Ctrl+Click the locales path, or Open With. New Presentation
  writes a starter project; Compile Current File writes the JSON beside your file."
- **Code** `#c6-code-locales`: `locales "./locales.json"      // Ctrl+Click opens the Locale Editor` / `> Eligian: Edit
  Locales` / `> Eligian: New Presentation…   blank · chapters · video · library` / `> Eligian: Compile Current File →
  tour.json`.
- **Spot / callout:** `#c6-tok-locales`; `#c6-cl-e14` "label quick fixes: Create labels file · Create label entry
  'hub.title' · Use '&lt;key&gt;'" (escaped: `callout` writes HTML).
- **Frame** `#c6-fx-locale`: tab `locales.json · Locale Editor` (custom editor `eligian.localeEditor`, files
  `**/*locale*.json`); tree `▼ locale keys` `▼ hub` `📝 title` `📝 tagline` `▼ tour` `📝 greeting`; +2 s the table
  `Key │ en-US │ nl-NL` / `hub.title │ The Eligian Tour │ De Eligian-rondleiding` (the tour's `locales.json`); +4 s
  the quick pick `Eligian: New Presentation` / `Choose a starter` / `Blank` `One timeline with a title, a few timed
  events and play / pause buttons` … `Library` `A presentation whose reusable actions live in a library file`;
  +5.5 s on a file whose `locales` import has no `languages` block: `Locales import requires a languages block to
  declare available languages.` and the fix `Generate language block (2 languages)`.
- **Source:** `media/locale-editor.ts:1153,1204,1326-1331`, `commands/new-presentation.ts:30-36`,
  `starters/starters.ts:33-59`, `commands/compile.ts:196` (`✓ Compiled to tour.json`),
  `labels/language-block-code-actions.ts:80-88`, `eligian-code-action-provider.ts:163,228,354` (the label fixes).

### Beat 15 — settings + recap (99–106 s, `as e15`)

- **Narration:** "Ten settings tune it: lint, selector checks, playhead highlights, CodeLenses, inlay hints. Concise,
  checked, live — that's Eligian in the editor. Hub."
- **Code** `#c6-code-recap`: `eligian.validation.selectorNotInLayout off · ids · all` / `eligian.validation.eligiusLint
  true` / `eligian.preview.highlightActiveEvents true` / `eligian.codeLens.preview · cssReferences true` /
  `eligian.inlayHints.parameterNames none · literals · all` / `eligian.inlayHints.sequenceTimes · staggerTimes ·
  computedTimes · timelineDuration` — exactly the ten keys of `packages/extension/package.json:74-143`.
- **Spot / callout:** `#c6-tok-recap`; `#c6-cl-e15` "Settings › Extensions › Eligian".
- **Frame** `#c6-fx-done`: "Chapter 7 ✓".

---

## 2. What this chapter must prove (acceptance)

1. `pnpm run check:examples` (`--max-warnings 0`), `pnpm run smoke:examples` and `pnpm run fmt:examples` pass;
   `smoke` reports `timeline 'The Editor': 45 positions ok`, and
   the compiled timeline's duration is 106 s.
2. The controller-balance test (`tour-controllers.spec.ts`) passes: the chapter attaches only the skeleton's
   controllers.
3. **Every quoted string is verbatim** and re-checked against its source: the diagnostics of beats 2, 3, 4, 7, 8, 12
   and 14 against `node packages/cli/bin/cli.js check` (and `smoke` for the runtime error) on scratch files outside
   `examples/`; the completion lists (beat 5), signature label and inlay hints (6), hovers (4, 7), code-action titles
   (3, 4, 8, 10, 14), symbols (9), Gantt bars (13) and the CSS lens (8) against the providers in
   `packages/language/src` run on a copy of the tour; the command, setting, snippet and webview texts against
   `packages/extension/package.json`, `snippets/eligian.json`, `preview.html`, `locale-editor.ts`, `starters.ts`.
4. Every row of the extension coverage table (§3) points at a beat that shows it, or is marked narration
   only: hot reload and untrusted-workspace host modules (beat 11's narration, Chapter 06 beat 8), operation and CSS
   hovers (beat 7's narration), CSS / DOM-event / label-key completion and the `on event` skeleton (beat 5's
   narration).
5. The chapter **states plainly** that the frames are reenactments (beat 1's narration, §0).
6. Leaving and re-entering, or pressing `r`, starts the chapter like the first visit: every popup hidden again.

## 3. Verification notes and how to re-verify

The strings drift when messages change upstream; after a bump, re-run these (the scratch files belong in the OS temp
dir, never under `examples/`, or `check:examples` picks them up; a scratch program that uses the tour's layout and
styles needs copies of `layout.html` and `tour.css` next to it):

| Beat | Re-capture with |
|---|---|
| 2 | `eligian check` on `demo.eligian` = `layout` + `styles "./tour.css"` + `action intro() [ selectElement("#hub") addClass("in") ]` + the snippet |
| 3 | `eligian check` on `layout` + the snippet's `styles` line + `import { spotlight } from "./presentation.eligian"` + the action + a timeline calling `mark()`; code actions for the titles |
| 4 | `eligian check` on the snippet with a layout holding `#box` and a stylesheet with `.on`; code actions + hover for the fix titles and the call hover |
| 5–7, 9 | the language providers on a copy of the tour (`CompletionProvider.getCompletion`, `SignatureHelp.provideSignatureHelp`, `InlayHintProvider.getInlayHints`, `HoverProvider.getHoverContent`, `DocumentSymbolProvider.getSymbols`), loaded the way `compiler/pipeline/check.ts` loads files (library imports, `loadCssImports`) |
| 8 | `eligian check` with a `navigate "Logik"` line in the tour copy (the message lists every timeline: it grows with each new chapter); `cssReferenceLenses` for the lens count |
| 10 | `eligian fmt` on the before snippet; the range code action on `0s..4s` |
| 12 | `eligian check` (lint path) and `eligian smoke` (runtime message, position, call chain) on the two actions in a timeline `"Logic"`; `formatError()` of `compile()`'s error for the brace line |
| 13 | `timelineGantt(program)` for the tour; percentages = start / 57 and length / 57 |
| 14 | code actions on `locales "./locales.json"` in a program without `languages` (run from the scratch directory's drive: the labels file is read relative to the document) |

Findings while building the chapter (recorded, not changed here):
- The chapter's first design showed `eligian(<code>)` after CSS, parse, `setData` and navigate diagnostics. Those
  validators put the code in the diagnostic's `data` only, so VS Code shows the source alone (`eligian`); `check` reads the code from
  the data and prints it. The dataflow, argument-count, runtime and lint diagnostics set `code` and show
  `source(code)`.
- The imported-action completion detail is `(selector) - imported action`, without the parameter type.
- The CSS CodeLens on `#tok-timeline` reads `1 Eligian reference` (one `spotlight("#tok-timeline")` in tour.eligian,
  line 210). It sits on the first rule naming the id, which since the id-registration blocks left tour.css is the
  rule the frame shows, `#tok-timeline { anchor-name: --cl-name; }`.

### Extension coverage

One row per item the extension contributes (`packages/extension/package.json` unless noted) and the beat that
shows it.

| Item | Beat |
|---|---|
| Command `eligian.compile` *Eligian: Compile Current File* (also editor context menu) | 14 |
| Command `eligian.newPresentation` *Eligian: New Presentation…* (starters from `starters.ts`) | 14 |
| Command `eligian.preview` *Eligian: Preview Timeline* + keybinding `ctrl+k v` / `cmd+k v` (also context menu) | 11 |
| Command `eligian.previewAt` *Eligian: Preview From Time* (hidden from the palette; CodeLens / Gantt double-click) | 11, 13 |
| Command `eligian.openLabelEditor` *Eligian: Edit Locales* (also context menu) | 14 |
| Command `eligian.showTimelineView` *Eligian: Show Timeline View* + the `Eligian` panel container with the `Timeline` webview view | 13 |
| Command `eligian.findEligianReferences` *Eligian: Find Eligian References* (CSS / HTML context menu) | 8 |
| Internal command `eligian.generateJSDoc` (the `/**` template) | 7 |
| Internal command `eligian.openLocaleFile` (Ctrl+Click on the `locales` path) | 14 |
| Internal commands `eligian.createLabelsFile`, `eligian.createLabelEntry` (label quick fixes) | 14 (callout) |
| Custom editor `eligian.localeEditor` *Locale Editor* (`**/*locale*.json`, Open With) | 14 |
| Snippets `snippets/eligian.json`: Action, Endable action, Event action, Timeline, Chapter timeline, Languages block, Library | 10 |
| Setting `eligian.validation.selectorNotInLayout` | 3 (callout), 15 |
| Setting `eligian.validation.eligiusLint` | 12, 15 |
| Setting `eligian.preview.highlightActiveEvents` | 11, 15 |
| Setting `eligian.codeLens.preview` | 11, 15 |
| Setting `eligian.codeLens.cssReferences` | 8, 15 |
| Settings `eligian.inlayHints.parameterNames`, `.sequenceTimes`, `.staggerTimes`, `.computedTimes`, `.timelineDuration` | 6, 15 |
| Diagnostics: syntax errors, semantic rules, `setData` targets | 2 |
| CSS / selector validation + *Change to* / *Create '.x' in …* fixes | 3 |
| Dataflow errors + *Insert selectElement* / *Add target* fixes | 4 |
| Completion (operations, actions, controllers, CSS, DOM events, keys, timeline names, label keys, event skeletons) | 5 |
| Signature help, inlay hints | 6 |
| Hovers: call (JSDoc + requirements), definition (roles), timeline header, operations | 7 |
| Go to Definition, references, CSS CodeLens, rename, *Change to "…"* / *Create timeline "…"* on a navigate target | 8 |
| Outline / document symbols | 9 |
| Format Document, block-label decorations, *Convert to '… for …'* range refactor | 10 |
| Preview webview: controls, scrubber, timeline / language selects, *Keep position on reload*, EventBus Debug Viewer, Compilation Errors + *Retry Compilation*, *Preview from* CodeLens, playhead highlight | 11 |
| Runtime-error diagnostics (`eligius-runtime`) + toast with *Go to Source*; Eligius lint diagnostics (`Eligius lint`) | 12 |
| Timeline (Gantt) view | 13 |
| *Generate language block* fix | 14 |
| Hot reload of CSS / HTML / locales / host module; untrusted-workspace host stand-ins | narration only (11; Chapter 06 beat 8) |

## 4. Resolved decisions

- **Advance mode:** the beats play on the raf clock; `space` toggles, `r` replays, `Esc` / `← Hub` leave.
- **Effect-pane fidelity:** *all reenacted* (mock IDE), every string real; illustrative only: the Debug Viewer row's
  time, the preview's `24.0s` readout and the playhead position, the window chrome (tab names such as `demo.eligian`).
- **One chapter** (not split into "writing" and "running"), fifteen beats, 106 s.
- **No chapter-local actions, no new library actions:** frames and popups are driven by classes alone.
- **Timeline name / uri:** `"The Editor"` (the string name is the `navigate` uri). Hub card label: "The Editor".

## 5. Files

```
examples/eligian-tour/
├── tour.eligian    # the "The Editor" timeline (skeleton lifecycle, 15 labelled items, 29 sub-step events);
│                   #   hub card #card-ch6 + key 7 navigate "The Editor"
├── layout.html     # #ch6: chrome, fifteen code blocks (#c6-code-*), fourteen mock IDE frames (#c6-fx-*.fx.ide)
│                   #   with their popups (#c6-pop-*, #c6-gantt-playhead) + the done card, fifteen callout chips;
│                   #   hub card name "The Editor"
└── tour.css        # the Mock IDE section (.fx.ide, .ide-*), anchors #c6-tok-* → --c6-cl-e1 … e15, fallback rows 1–15
```

`presentation.eligian` is unchanged.
