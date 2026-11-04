# eligian (CLI) — Known Issues

Found 2026-06-17 while building `examples/eligian-tour/` (first serious end-user
of the CLI). Each entry has a minimal repro, expected vs actual, root cause with
`file:line`, and a suggested fix. Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low.

Every entry carries a `Status (<date>, <command>): open | fixed | stale` line, re-verified by
running that command from the repo root (last pass 2026-11-04, spec 058 phase 0).

---

## ❌ B1 — RETRACTED (my error): the CLI is NOT a no-op

Status (2026-11-04, `node packages/cli/bin/cli.js --version`): stale — never a bug; prints `1.0.1`, rc 0.

**This entry was wrong.** The CLI works. Run via its real launcher
[bin/cli.js](bin/cli.js) — which imports `main` from `dist/cli.mjs` and calls it —
every mode behaves correctly:
```bash
node packages/cli/bin/cli.js --version                    # 0.0.1
node packages/cli/bin/cli.js some.eligian --check         # ✓ ... is valid
node packages/cli/bin/cli.js some.eligian                 # writes some.json, prints ✓
```
I originally ran `node packages/cli/dist/cli.mjs` **directly**. That file is the
esbuild *bundle*: it defines and `export`s `main` as default but does not
self-invoke — it is meant to be imported by `bin/cli.js`. I never looked in `bin/`,
assumed the bundle was the entry point, and "confirmed" it with a grep piped into
`head` (so I read `head`'s exit code, not grep's). Wrong method, wrong conclusion.

### B1b — possibly real, smaller: `package.json` `bin` points at the bundle, not the launcher

Status (2026-11-04, `node -p "const p=require('./packages/cli/package.json');JSON.stringify({bin:p.bin,files:p.files})"`):
stale — **resolved**. `bin` maps both `eligian` and `eligian-cli` to `./bin/cli.js` and
`files` is `["bin/cli.js","dist/cli.mjs"]`; asserted by `src/__tests__/package-bin.spec.ts:44-54`
(the `%s points at the bin/cli.js launcher` and `launcher is published and actually invokes
main()` tests). The text below describes the old `package.json`.

`package.json` `"bin"` maps `eligian`/`eligian-cli` → `./dist/cli.mjs` (the
non-self-invoking bundle), and `bin/cli.js` is **not** in the `files` allowlist
(`["dist","out"]`). Observed: `pnpm exec eligian --version` produces no output
(rc 0), i.e. the *configured* command runs the bundle directly and does nothing.
Running `node bin/cli.js` works. So **for local/installed use the `bin` field
likely should point to `bin/cli.js`** (or `dist/cli.mjs` should call `main()`
itself), and `bin/` should be in `files`. Flagging for the maintainer to confirm
intent — not asserting it as definitely broken, given B1 above.

---

## ✅ B2 — NOT A BUG (by design): selectors validated against imported CSS

Status (2026-11-04, `node packages/cli/bin/cli.js check b2.eligian` on the repro below, no `styles` import): stale —
by design, unchanged: `unknown_css_id_in_selector` for `#stage` and `#x`, `unknown_css_class` for `y`.

**Resolution (2026-06-17):** Working as intended. Compiling against absent/invalid
assets would produce JS that throws at runtime, so there is no value in allowing
it — a selector with no backing CSS is an error worth catching at compile time.
Authors must import a `styles` CSS that defines every selector/class they use
(including the timeline container selector). Kept here for the record only.

**Original (mis)report:** With no `styles` import the CSS registry is empty, yet
the validator still checks every `#id`/`.class`/class-name and they all fail.

**Repro (via API, since B1 blocks the CLI):**
```eligian
timeline "t" in "#stage" using raf {        // FAIL: Unknown CSS ID in timeline container selector: 'stage'
  at 0s..1s [
    selectElement("#x")                       // FAIL: Unknown CSS ID in selector: 'x'
    addClass("y")                             // (class also validated)
  ] []
}
```
- `in "#stage"` → `Unknown CSS ID in timeline container selector: 'stage'`
- `in ".stage"` → `Unknown CSS class in timeline container selector: 'stage'`
- `in "body"` (tag selector) → passes the CSS check
- `selectElement("#x")` inside an action/inline-endable → `Unknown CSS ID in selector: 'x'`
- Importing a CSS file that defines `#stage`/`#x`/`.y` → **compiles OK** (feature works as designed *when* CSS is present).

**Expected:** when no CSS is registered there is nothing to validate against, so
selector/class validation should be **skipped** (or at most a warning). Validation
should only error when CSS *is* imported and the selector is genuinely absent.

**Actual:** empty registry ⇒ every selector/class is "unknown" ⇒ hard error.

**Where:** the Feature-013 checks in `eligian-validator.ts`
(`checkTimelineContainerSelector`, `checkSelectorParameter`, `checkClassNameParameter`).
They need an "is any CSS registered for this document?" guard before flagging
unknown selectors.

---

## ✅ B3 — FIXED — Validation/semantic errors were mislabeled as "Parse Error"

Status (2026-11-04, `node packages/cli/bin/cli.js compile b2.eligian` on the B2 repro): fixed — prints
`Compilation failed:` / `Validation Error: Unknown CSS ID in selector: 'x'.`, no "Parse".

**Fixed 2026-06-17.** Langium semantic diagnostics were emitted with
`_tag: 'ParseError'` in `document-errors.ts`; now tagged `ValidationError`
(new generic kind `'SemanticValidation'`), so they format as **"Validation
Error:"**. Cascade: widened error unions in `document-errors.ts`, `parser.ts`
(`parseSource`), `library-loader.ts`, and `pipeline.ts` (`CompileError`,
`compileToIR`). At the CLI library boundary, `compile-file.ts` now throws
`CompilationError` (not `ParseError`) when the parse phase fails with an inner
`ValidationError`, so the category matches the message. Genuine lexer/parser
errors remain `ParseError`. Verified: 2012 language + 202 cli tests pass.

### Original report

**Summary:** Non-parse errors (CSS validation, semantic checks) are surfaced as
`ParseError` and printed under the header **"Parse failed:"** with messages
prefixed `Parse Error:`. They are not parse errors.

**Example actual output (a CSS-validation failure):**
```
Parse Error: Unknown CSS ID in timeline container selector: 'stage'
  at 17:31
```

**Expected:** distinct category/header for validation vs parse errors (e.g.
"Validation failed:" → maps to `CompilationError`/a `ValidationError`), so users
and CI can tell a syntax error from a semantic one.

**Where:** error classification in [src/compile-file.ts](src/compile-file.ts)
(everything funnels into `ParseError`) and the header in
[src/main.ts:154-156](src/main.ts#L154).

---

## ✅ B4 — FIXED — Wrong hint attached to CSS container-selector error

Status (2026-11-04, `node packages/cli/bin/cli.js compile b4.eligian`, a program with `styles` and an undefined
container `#nope`): fixed — `Validation Error: Unknown CSS ID in timeline container selector:
'nope'` with no hint.

**Fixed 2026-06-17** (as a consequence of B3). The bogus hint came from
`generateParseHint()`, which fires the "forget to define a timeline?" hint on any
message containing the substring "timeline" — including "...timeline container
selector". Now that these diagnostics are tagged `ValidationError`, they route to
`generateValidationHint()` instead, which correctly returns no hint here. (The
`generateParseHint` substring heuristic is still fragile but no longer reachable
for this case.)

### Original report

**Summary:** The CSS container-selector error carries an unrelated hint.

**Actual:**
```
Parse Error: Unknown CSS ID in timeline container selector: 'stage'
💡 Did you forget to define a timeline? Every program needs exactly one timeline.
```
The hint ("forget to define a timeline?") has nothing to do with an unknown CSS
ID. A correct hint would suggest defining `#stage` in an imported stylesheet, or
checking the selector spelling (with did-you-mean if close).

---

## ⚪ B5 — README examples do not match the grammar (won't compile)

Status (2026-11-04, `grep -nE '0\.\.5:|timeline raf|timeline video from|fadeIn\(1000\)|Did you forget' packages/cli/README.md`):
fixed — 0 matches; the README no longer carries DSL snippets (`eligian init` writes the starters).

The CLI README's example snippets use syntax that the current grammar rejects:

- `timeline raf { 0..5: { … } }` and `timeline video from "x.mp4" { … }`
  — actual grammar is `timeline "name" in "#sel" using raf { at 0s..1s … }`
  (name + `in <container>` + `using <provider>` required; events are `at a..b`,
  not `0..5:`).
- Examples place **bare built-in operations** directly under a timeline event
  (`selectElement(...)`, `fadeIn(1000)`). The validator (by design) rejects this:
  `Operation 'log' cannot be used directly in timeline events. Define an action
  that calls this operation, then call the action.` Timeline events must be an
  action call or an inline endable `[…][…]` block.
- The README's sample error output relies on the misfiring hint from **B4**.

**Suggested fix:** update README examples to current grammar and a compiling
shape, e.g.:
```eligian
action showTitle() [ selectElement("#title") addClass("visible") ]
timeline "demo" in "#app" using raf {
  at 0s..5s showTitle()
}
```

---

## ⚪ B6 — `-o <file>` / `-o -` unverified (blocked by B1)

Status (2026-11-04, `node packages/cli/bin/cli.js compile x.eligian -o out.json` and `… -o -`): fixed — the first
writes `out.json` (`✓ Compiled x.eligian → out.json`), the second prints the JSON to stdout; both rc 0.

Both output modes are documented but currently do nothing (subsumed by **B1**).
Listed separately so they get **re-tested once B1 is fixed** — the write path
([src/main.ts:144-152](src/main.ts#L144)) and stdout path look correct on
inspection but have never actually run.

---

## ⚪ B7 — EOF parser errors report location `NaN:NaN`

Status (2026-11-04, `node packages/cli/bin/cli.js compile trunc.eligian` on `action show() [ selectElement("#x")`):
fixed — `Parse Error: Expected ']' here, but found the end of the file.` `at 1:36`, no `NaN`.

A truncated source (e.g. an unclosed `[`) produces:
```
Parse Error: Expecting token of type ']' but found ``.
  at NaN:NaN
```
The EOF token has no `startLine`/`startColumn`, so the location computed in
`document-errors.ts` (parser-error branch) becomes `NaN`. Should fall back to the
last line/column of the source (or 1:1) instead of `NaN`. Minor; pre-existing.

---

## Note — possible asset-path edge case (not reproduced reliably)

Status (2026-11-04, `node packages/cli/bin/cli.js check <C:-temp>/x.eligian` and `compile` from the repo on `F:`,
`styles "./x.css"` beside the source): stale — not reproduced; 0 errors, compile rc 0.

When the `.eligian` source and its `./x.css` lived in an OS temp dir on a
different drive than the project, `styles "./x.css"` reported `Asset file not
found` despite the file existing beside the source; the same setup inside the
project tree resolved fine (relative and absolute input paths both worked).
Possibly a cross-drive / temp-path resolution quirk — flagging for awareness, not
a confirmed bug.

---

## ✅ B8 — RESOLVED — Typir messages carried a `While validating the AstNode …` prefix

Status (2026-11-04, `node packages/cli/bin/cli.js check packages/cli/src/__tests__/__fixtures__/check-codes/video-without-from.eligian --format json`):
fixed — **resolved**. The one diagnostic's message is `Timeline provider 'video' requires a source
file. Add: from "<file path>"`, with no prefix.

Every Typir diagnostic reached the user as `While validating the AstNode '<node>', this error is
found: <message>`. Origin: Typir's printer, `printValidationProblem` in
`typir@0.3.3 lib/services/printing.js:99-104`. Now stripped for all Typir diagnostics in
`EligianDocumentValidator` (`packages/language/src/eligian-document-validator.ts`), so the
message is the rule's own text (spec 058 phase 0, FR-004b).

---

## ✅ B9 — RESOLVED — video timeline without `from` reported twice

Status (2026-11-04, `node packages/cli/bin/cli.js check packages/cli/src/__tests__/__fixtures__/check-codes/video-without-from.eligian --format json`):
fixed — **resolved**. Exactly one diagnostic, code `timeline-source-required` at 3:35.

`timeline "t" in "#stage" using video { … }` (no `from`) produced the same error twice: once from
the Langium validator (`packages/language/src/validators/timeline-validator.ts:84`,
`checkSourceRequired`) and once from the Typir rule
(`packages/language/src/type-system-typir/validation/timeline-validation.ts:72`, the latter also
with the B8 prefix). The Typir rule is removed; its "does not use a source file" warning moved
into `timeline-validator.ts` so it is still reported once (spec 058 phase 0, FR-004a).
