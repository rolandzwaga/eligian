# @eligian/cli — Known Issues

Found 2026-06-17 while building `examples/eligian-tour/` (first serious end-user
of the CLI). Each entry has a minimal repro, expected vs actual, root cause with
`file:line`, and a suggested fix. Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low.

> How these were verified: because of **B1** the `eligian` binary produces no
> output at all, so validation was done by calling the programmatic API
> (`compileFile` from `packages/cli/dist/index.mjs`) directly. The compiler
> itself works — the binary is the problem.

---

## 🔴 B1 — The CLI binary is a complete no-op (`main()` is never called)

**Summary:** Every invocation of the `eligian` binary exits 0 and produces **no
output, no file, and no messages** — including `--version`, `--help`, and the
no-argument case. The CLI does nothing.

**Repro:**
```bash
node packages/cli/dist/cli.mjs --version            # (silent) exit 0
node packages/cli/dist/cli.mjs --help               # (silent) exit 0
node packages/cli/dist/cli.mjs                       # (silent) exit 0  (should be a usage error)
node packages/cli/dist/cli.mjs some.eligian          # (silent) exit 0, writes no some.json
node packages/cli/dist/cli.mjs some.eligian --check  # (silent) exit 0
node packages/cli/dist/cli.mjs some.eligian -o -     # (silent) exit 0, 0 bytes on stdout
node packages/cli/dist/cli.mjs some.eligian -o out.json   # exit 0, out.json NOT created
```

**Expected:** compile/validate, write `<input>.json` (or stdout for `-o -`),
print success/error messages, set exit code per README (0/1/3).

**Actual:** nothing happens; always exit 0.

**Root cause:** [src/main.ts:227](src/main.ts#L227) declares
`export default function main() { … }` but **nothing ever calls `main()`**.
[esbuild.mjs:33](esbuild.mjs#L33) bundles `src/main.ts` directly as the bin
(`dist/cli.mjs`), so the built binary just defines the function and exits. Grep
of `dist/cli.mjs` confirms there is no top-level `main()` call.

**Suggested fix:** invoke `main()` at the end of `src/main.ts` (it's the bundled
entry), then rebuild:
```ts
// end of src/main.ts
main();
```
…and re-verify every mode below, since B-items B?-via-B1 are masked by this.

**Consequence — dangerous:** because the process always exits 0, `--check` in CI
**passes regardless of validity** — a broken/invalid `.eligian` file looks green.
Silent false-success.

---

## 🟠 B2 — CSS selector/class validation runs even when no `styles` is imported

**Summary:** With **no `styles` import**, the CSS registry is empty, yet the
validator still checks every `#id`, `.class`, and class-name argument against it —
so they **all fail**. This makes the language effectively unusable without
importing a CSS file that defines every selector used (incl. the timeline
container selector).

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

## 🟡 B3 — Validation/semantic errors are mislabeled as "Parse Error"

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

## 🟡 B4 — Wrong hint attached to CSS container-selector error

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

Both output modes are documented but currently do nothing (subsumed by **B1**).
Listed separately so they get **re-tested once B1 is fixed** — the write path
([src/main.ts:144-152](src/main.ts#L144)) and stdout path look correct on
inspection but have never actually run.

---

## Note — possible asset-path edge case (not reproduced reliably)

When the `.eligian` source and its `./x.css` lived in an OS temp dir on a
different drive than the project, `styles "./x.css"` reported `Asset file not
found` despite the file existing beside the source; the same setup inside the
project tree resolved fine (relative and absolute input paths both worked).
Possibly a cross-drive / temp-path resolution quirk — flagging for awareness, not
a confirmed bug.
