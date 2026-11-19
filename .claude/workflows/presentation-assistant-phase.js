// EDITING THIS SCRIPT WHILE A RUN CAN STILL BE RESUMED:
// Resume (resumeFromRunId) replays agent() calls by a hash CHAINED over every call in spawn
// order. Changing the TEXT of any prompt that an earlier call in the run already used (a gate's
// command list, a fixer's rules, a label, CONTEXT) re-runs that call AND every call after it
// (implementers included; they rewrite code). Skipping a call breaks the chain the same way.
// So, for a phase whose build stage is in flight or may be resumed:
//   1. never change a prompt's text; add an ARGUMENT that defaults to the old behaviour and
//      switch the default only before the next phase's fresh run;
//   2. after every resume, read the newest agent-*.meta.json label once; if it is not the call
//      you meant to resume from, TaskStop immediately;
//   3. a task named in args.retry_tasks needs its rewritten tasks.md section ON DISK first;
//   4. a user ruling is recorded in the spec's FR/SC ROW FIRST, then Clarifications, then
//      tasks. A ruling that does not touch the row is incomplete: the verifier reads the row.
// Pure comments and new, unused arguments are safe to add at any time.
//
// Cloned from f:/projects/iterum/.claude/workflows/profundum-phase.js (2026-11-04) and adapted
// to this repo: pnpm/TS7/Effect v4/Biome/Vitest gates instead of CMake + Catch2 shards,
// typegraph ts_* tools for code-reality checks, no perf-exclusion machinery.
//
// This file: cloned from .claude/workflows/mcp-server-phase.js (2026-11-19) for spec 059, the
// presentation assistant (specs/059-presentation-assistant/roadmap.md). Changed: the roadmap and
// artifact paths, the phase registry, the roadmap section numbers (phases §8, decisions §9,
// design §2–§7), the pointer to spikes.md, and a fallback when typegraph is not connected.
export const meta = {
  name: 'presentation-assistant-phase',
  description: 'Three-stage speckit-style pipeline for one phase of the presentation assistant roadmap, the brief interview of the Eligian MCP server (specs/059-presentation-assistant/roadmap.md): specify (spec→challenge→clarify-scan), plan (encode answers→plan→challenge→tasks), build (implement→gate→comply→report). Adversarial agents check every artifact; the user answers clarifications between specify and plan.',
  whenToUse: 'When building a phase of the presentation assistant from specs/059-presentation-assistant/roadmap.md §8. Flow: (1) run args {phase: N, stage: "specify"} — returns clarification questions; (2) the MAIN LOOP asks the user (AskUserQuestion, multiple choice) until every question is resolved; (3) run {phase: N, stage: "plan", clarifications: {Q1: "...", ...}}; (4) user reviews spec/plan/tasks; (5) run {phase: N, stage: "build"}. Artifacts land in specs/059-presentation-assistant/phase-N-<slug>/. Nothing commits.',
  phases: [
    { title: 'Specify', detail: 'spec.md with FR/SC from the roadmap phase', model: 'opus' },
    { title: 'Challenge Spec', detail: 'parallel skeptics + bounded revision loop', model: 'opus' },
    { title: 'Clarify Scan', detail: 'ambiguity questionnaire for the user', model: 'opus' },
    { title: 'Encode Clarifications', detail: 'integrate answers into FR/SC rows, gate on unresolved', model: 'sonnet' },
    { title: 'Plan', detail: 'plan.md, reused APIs verified with typegraph', model: 'opus' },
    { title: 'Challenge Plan', detail: 'coverage / Effect+bundle / reuse-reality skeptics + revision', model: 'opus' },
    { title: 'Tasks', detail: 'dependency-ordered tasks.md with parallel groups', model: 'opus' },
    { title: 'Dispatch', detail: 'parse tasks.md into executable groups', model: 'sonnet' },
    { title: 'Implement', detail: 'one agent per task, test first, disjoint files', model: 'opus' },
    { title: 'Gate', detail: 'typecheck + biome ci + scoped vitest (+ effect:check, examples) per group; bounded fixer loop', model: 'opus' },
    { title: 'Comply', detail: 'adversarial FR/SC verification, real output only', model: 'opus' },
    { title: 'Report', detail: 'compliance.md + honest gap list; roadmap marked done if COMPLETE', model: 'sonnet' },
  ],
}

// ---------------------------------------------------------------------------
// Args / phase registry (roadmap §8)
// ---------------------------------------------------------------------------
const SLUGS = {
  1: 'phase-1-brief-engine',
  2: 'phase-2-gates-signoff-additions',
  3: 'phase-3-teaching-hook-evals',
}
const PHASE_TITLES = {
  1: 'Phase 1 — Brief engine',
  2: 'Phase 2 — Gates, sign-off, additions, adoption',
  3: 'Phase 3 — Teaching, hook, evals',
}

let A = args
if (typeof A === 'string') {
  try { A = JSON.parse(A) } catch (e) { throw new Error(`args arrived as unparseable string: ${A}`) }
}
if (!A || typeof A !== 'object') throw new Error('Usage: {phase: 1-3, stage: "specify"|"plan"|"build", clarifications?: {...}}')
const phaseNum = A.phase
const stage = A.stage || 'specify'
if (!(phaseNum in SLUGS)) throw new Error(`args.phase must be 1-3, got: ${JSON.stringify(phaseNum)}`)
if (stage !== 'specify' && stage !== 'plan' && stage !== 'build') throw new Error(`args.stage must be "specify", "plan" or "build", got: ${JSON.stringify(stage)}`)
// args.unblock: task ids (or "fix:<group key>") whose cached status "blocked" has been RULED ON by the
// user (the decision is recorded in spec/plan/tasks). On a resume those results are treated as done.
const unblocked = Array.isArray(A.unblock) ? A.unblock.map(String) : []
// args.retry_tasks: task ids whose tasks.md section was REWRITTEN after a user ruling. The task
// prompt gains a marker so the cached (blocked) result is bypassed and the task re-executes.
const retryTasks = Array.isArray(A.retry_tasks) ? A.retry_tasks.map(String) : []
// args.gate_epochs: {"Group 3": 2} bumps ONLY that group's gate prompt so its cached red gate is
// re-measured on a resume after a main-loop fix, without invalidating every other group's cache.
const groupKey = (name) => String(name).split(/\s+[—-]\s+/)[0]
const gateEpoch = (name) => (A.gate_epochs && A.gate_epochs[groupKey(name)]) || 1
// Test-first groups (tasks.md writes failing tests that LATER groups turn green) are expected to
// leave the gate's tests red; typecheck and lint must still be green. Detected from the group name
// ("Failing tests …", "test-first") or listed in args.expected_red_groups: ["Group 5"]. Added
// 2026-11-04 after Phase 0 Group 5 burnt three fixer rounds on a planned red. No prompt text changes.
const expectedRedGroups = Array.isArray(A.expected_red_groups) ? A.expected_red_groups.map(String) : []
const isExpectedRed = (name) => expectedRedGroups.includes(groupKey(name)) || /failing tests|test-first|tests? first/i.test(String(name))

const ROOT = 'f:/projects/eligius/eligian'
const ROADMAP = 'specs/059-presentation-assistant/roadmap.md'
const SPIKES = 'specs/059-presentation-assistant/spikes.md'
const SLUG = SLUGS[phaseNum]
const DIR = `specs/059-presentation-assistant/${SLUG}`
const SPEC = `${DIR}/spec.md`
const PLAN = `${DIR}/plan.md`
const TASKS = `${DIR}/tasks.md`
const COMPLIANCE = `${DIR}/compliance.md`

// ---------------------------------------------------------------------------
// Shared context handed to every agent. AGENTS.md / CLAUDE.md are injected into every
// subagent already; this names only what this workflow leans on.
// ---------------------------------------------------------------------------
const CONTEXT = `
You are working in the Eligian monorepo at ${ROOT} (Langium DSL + Effect v4 compiler + CLI +
VS Code extension; pnpm workspace; TypeScript 7; Biome; Vitest). You are building the PRESENTATION
ASSISTANT (spec 059): the brief interview on top of the Eligian MCP server (eligian mcp, spec 058,
shipped; its code is in packages/cli/src/mcp/). The authoritative roadmap is ${ROADMAP} — READ IT
FIRST (all of it for context, then focus on "${PHASE_TITLES[phaseNum]}" in §8 and the decisions in
§9). ${SPIKES} holds what was MEASURED about the clients and effect/ai (elicitation outcomes,
plugin hooks, headless runs); where it and your assumptions differ, the spikes win. The phase
artifacts live in ${DIR}/ (spec.md, plan.md, tasks.md, compliance.md).

THE ROADMAP IS REUSE-FIRST. The compiler, operation registry, check/lint/fmt/smoke, starters and
the language-server data and the MCP server (tools, storyboard parser, path policy, telemetry,
knowledge generator) all exist; the roadmap's §2–§7 name the files. VERIFY every such claim with the
typegraph tools before relying on it (ts_navigate_to, ts_module_exports, ts_type_info,
ts_references); when the typegraph server is not connected in your session, use Grep and Read and
cite file:line instead. Building something that already exists is a defect.

REPO RULES THAT BITE HERE (the rest is in AGENTS.md, already loaded):
- Windows paths for every file tool except Bash: F:\\projects\\eligius\\eligian\\... ; Bash takes /f/... .
- pnpm only. Never npm/yarn. Never edit anything under **/generated/ or *.generated.ts by hand.
- Imports come from installed packages ('eligius', 'typir'), never from ../eligius/src or f:/projects/typir.
- Effect v4 idioms: Effect.fail with tagged errors (_tag), Context.Service + Layer, no thrown
  exceptions in the pipeline, Effect.void, no Effect.gen adapter. Effect code must pass
  pnpm effect:check:cli / :language with 0 errors 0 warnings (plain tsc does not run those rules).
- The CLI bundle (packages/cli/esbuild.mjs) inlines the workspace packages from source and keeps
  only package.json "dependencies" external; package-bin.spec.ts asserts that. An MCP server over
  stdio must never write to stdout except protocol frames; logs go to stderr.
- Tests: *.spec.ts under __tests__/, fixtures under __fixtures__/; read specs/TESTING_GUIDE.md
  before writing tests; createTestContext()/getErrors() helpers in packages/language/src/__tests__/test-helpers.ts.
- Coverage thresholds in packages/language (lines 79.8 / functions 80 / branches 69.9) must not regress.
- Constitution: .specify/memory/constitution.md governs (simplicity first, TDD, tagged errors, no premature docs).

DISCIPLINE: every claim about existing code must cite a file:line or a typegraph result you actually
obtained this session. Never invent an API — look it up and quote the real signature.
`

// Slim context for MECHANICAL roles (reporters, transcribers, gates): no roadmap read.
const CONTEXT_LITE = `
You are working in the Eligian monorepo at ${ROOT}, on the presentation assistant (spec 059),
"${PHASE_TITLES[phaseNum]}" (artifacts in ${DIR}/: spec.md, plan.md, tasks.md). Do NOT read
${ROADMAP} — everything you need is in this prompt and the files it names.
Windows paths for every file tool except Bash (F:\\projects\\eligius\\eligian\\...); Bash takes /f/... .
pnpm only. Commands run from the repo root.

DISCIPLINE: report only what you actually observed; quote real output verbatim, never paraphrase or invent.
`

// ---------------------------------------------------------------------------
// Model policy (as in iterum, tiered):
// - AUTHOR (opus): authoring, judgment and verification roles; errors here are silent.
// - MECH (sonnet): transcription, reporting, gate roles; errors here are loud (schema mismatch,
//   red gate, reviewable diff). Never add effort:'low' to the gate reporter.
// - TRIVIAL (haiku): one-line edits with a self-contained prompt.
// ---------------------------------------------------------------------------
const AUTHOR = 'opus'
const MECH = 'sonnet'
const TRIVIAL = 'haiku'
const run = (prompt, opts) => agent(prompt, { model: AUTHOR, ...opts })

// args.git_guard: forbid the gate and fixer agents to change git state. Added 2026-11-19 after the
// Group 2 fixer of the first Phase 1 build ran `git stash -u` to compare a red against a baseline:
// that stash took every uncommitted file of the run (spec, plan, tasks, the workflow itself, the
// code of Groups 1–2) out of the tree while the build went on. Default off only so that a run
// resumed without it replays its cache; pass git_guard: true on every new or resumed build.
const GIT_GUARD = A.git_guard
  ? `\n\nGIT STATE IS OFF LIMITS: the working tree holds this run's uncommitted work (spec, plan, tasks, the code of every earlier group) and nothing else has it. NEVER run git stash, git checkout <path>/., git restore, git reset, git clean, git switch, git commit, git worktree or any other command that changes the index, the working tree or the branch. Read-only git (status, diff, log, show) is fine. To tell a red that predates this group from a new one, read the gate log, run the failing test file on its own, or compare with the CI run of main; never by removing the group's changes.`
  : ''

// args.flake_rule: on Windows, tests that spawn the CLI bundle time out at 30000 ms (and vitest fork
// workers exit with 0xC0000409) when the whole cli package runs under load, and pass when their file
// runs alone (measured 2026-11-19: fmt, mcp-scenario and smoke-determinism, 74/74 alone in 56 s).
// Same default-off convention as git_guard.
const FLAKE_RULE = A.flake_rule
  ? `\n\nKNOWN LOAD FLAKE (Windows): when a test that spawns the CLI fails with "Test timed out in 30000ms", or a vitest fork worker exits unexpectedly (exit code 3221226505), during a whole-package run, re-run ONLY those test files on their own (pnpm -C packages/<pkg> exec vitest run <files>, foreground, its own log). If they all pass alone, the red is a load flake: count tests_ok as true and name each file in summary as "load flake: timed out in the package run, passed alone". If one fails alone too, it is a real red.`
  : ''

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const DOC_STATUS = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'summary', 'open_questions'],
  properties: {
    path: { type: 'string', description: 'repo-relative path of the file written' },
    summary: { type: 'string', description: 'dense summary of the document content' },
    open_questions: { type: 'array', items: { type: 'string' }, description: 'decisions deliberately left to the user (empty if none)' },
  },
}

const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'area', 'question', 'why_it_matters', 'options', 'recommendation'],
        properties: {
          id: { type: 'string', description: 'Q1, Q2, ... — stable ids the answers key on' },
          area: { type: 'string', description: 'functional-scope | behaviour-contract | data-and-state | non-functional | integration | edge-cases | terminology' },
          question: { type: 'string', description: 'one precise question; different answers must lead to materially different specs' },
          why_it_matters: { type: 'string', description: 'which FR/SC is ambiguous without the answer, and what could be built wrong' },
          options: { type: 'array', items: { type: 'string' }, description: '2-4 concrete candidate answers with their consequences, one line each' },
          recommendation: { type: 'string', description: 'the option you would pick and why (one sentence)' },
        },
      },
    },
  },
}

const ISSUES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'section', 'problem', 'suggested_resolution'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          section: { type: 'string', description: 'heading / FR id / SC id the issue is in' },
          problem: { type: 'string', description: 'what is wrong, with evidence (file:line or typegraph result for code claims)' },
          suggested_resolution: { type: 'string', description: 'concrete edit that would resolve it' },
        },
      },
    },
  },
}

const RECHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resolved', 'unresolved'],
  properties: {
    resolved: { type: 'boolean', description: 'true if every blocker and major issue is now addressed in the document' },
    unresolved: { type: 'array', items: { type: 'string' }, description: 'issues still not addressed, quoting the document' },
  },
}

const TASKGROUPS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['packages', 'groups'],
  properties: {
    packages: { type: 'array', items: { type: 'string', enum: ['language', 'cli', 'extension', 'shared-utils'] }, description: 'workspace packages this phase touches' },
    groups: {
      type: 'array',
      description: 'executed strictly in order; tasks within a group run in parallel only if parallel=true',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'parallel', 'tasks'],
        properties: {
          name: { type: 'string' },
          parallel: { type: 'boolean', description: 'true ONLY if all tasks touch fully disjoint NEW files (no shared package.json / index.ts / esbuild.mjs / existing-file edits)' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'title', 'instructions', 'files'],
              properties: {
                id: { type: 'string', description: 'task id from tasks.md, e.g. T003' },
                title: { type: 'string' },
                instructions: { type: 'string', description: 'ONE-to-THREE sentence orientation summary ONLY (goal + the test that proves it). Do NOT copy the task text — the executor reads its full section from tasks.md. A full copy overflows the output-token cap.' },
                files: { type: 'array', items: { type: 'string' }, description: 'every file this task creates or edits (repo-relative, forward slashes)' },
              },
            },
          },
        },
      },
    },
  },
}

const IMPL_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id', 'status', 'files_written', 'notes'],
  properties: {
    task_id: { type: 'string' },
    status: { type: 'string', enum: ['done', 'blocked'] },
    files_written: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string', description: 'deviations from the task instructions, or why blocked' },
  },
}

const GATE_RESULT = {
  // 'failures' left OPTIONAL on purpose: requiring it made a green reporter omit-and-flail to the
  // StructuredOutput retry cap in iterum. The script defaults it.
  type: 'object',
  additionalProperties: false,
  required: ['typecheck_ok', 'lint_ok', 'tests_ok', 'summary'],
  properties: {
    typecheck_ok: { type: 'boolean' },
    lint_ok: { type: 'boolean', description: 'pnpm run ci: 0 errors, 0 warnings' },
    tests_ok: { type: 'boolean', description: 'every vitest / effect:check / examples command in the gate green' },
    summary: { type: 'string', description: 'the actual summary line(s) verbatim, one per command' },
    failures: { type: 'string', description: 'compiler errors / lint findings / failing test names + assertion output, verbatim excerpts; omit or empty if green' },
  },
}

const COMPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verdict', 'evidence'],
        properties: {
          id: { type: 'string', description: 'FR-xxx or SC-xxx' },
          verdict: { type: 'string', enum: ['pass', 'fail', 'partial'] },
          evidence: { type: 'string', description: 'file:line for FRs; verbatim test/command output for SCs. "Implemented" without specifics is INVALID.' },
        },
      },
    },
  },
}

const DOC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['markdown'],
  properties: { markdown: { type: 'string' } },
}

// ---------------------------------------------------------------------------
// Helper: challenge → revise → recheck loop for an authored document.
// Bounded at 2 revision rounds; unresolved issues are surfaced, never hidden.
// ---------------------------------------------------------------------------
async function challengeAndRevise(docPath, docKind, skeptics, phaseTitle) {
  let round = 0
  let unresolvedTail = []
  while (round < 2) {
    round++
    const issueSets = await parallel(
      skeptics.map(s => () =>
        run(
          `${CONTEXT}\n\nYou are an adversarial reviewer of ${docPath} (${docKind}). Read it fully, plus every file it cites. YOUR LENS: ${s.lens}\n\nReport only defects you can substantiate. An empty issues list is a valid result — do not pad.`,
          { label: `challenge:${s.key}:r${round}`, phase: phaseTitle, schema: ISSUES_SCHEMA, model: s.model || AUTHOR },
        ).then(r => r.issues.map(i => ({ ...i, lens: s.key }))),
      ),
    )
    const issues = issueSets.filter(Boolean).flat()
    const serious = issues.filter(i => i.severity !== 'minor')
    log(`${docKind} challenge round ${round}: ${issues.length} issues (${serious.length} blocker/major)`)
    if (issues.length === 0) return { rounds: round, unresolved: [] }

    await run(
      `${CONTEXT}\n\nRevise ${docPath} to resolve the review issues below. Apply blockers and majors fully; apply minors where they improve the document; if you REJECT an issue, add a short "Review notes" entry at the bottom of the document stating why. Do not weaken requirements to dodge an issue — resolving by relaxing a threshold is forbidden unless the issue proves the threshold wrong against the roadmap. Edit the file in place.\n\nISSUES:\n${JSON.stringify(issues, null, 2)}`,
      { label: `revise:${docKind}:r${round}`, phase: phaseTitle },
    )

    const recheck = await run(
      `${CONTEXT_LITE}\n\nVerify that ${docPath} now addresses every blocker/major issue below (resolved in-text or explicitly rejected in "Review notes" with sound reasoning). Quote the document for each.\n\nISSUES:\n${JSON.stringify(serious, null, 2)}`,
      { label: `recheck:${docKind}:r${round}`, phase: phaseTitle, schema: RECHECK_SCHEMA, model: MECH },
    )
    if (!recheck || recheck.resolved) return { rounds: round, unresolved: [] }
    unresolvedTail = recheck.unresolved
    log(`${docKind} recheck: ${unresolvedTail.length} unresolved — ${round < 2 ? 'one more round' : 'giving up, surfacing to user'}`)
  }
  return { rounds: 2, unresolved: unresolvedTail }
}

// ===========================================================================
// STAGE: SPECIFY — specify → challenge spec → clarify scan.
// Ends by handing a questionnaire back to the main loop, which asks the user and
// re-enters at stage "plan" with the answers.
// ===========================================================================
if (stage === 'specify') {
  phase('Specify')
  log(`Authoring ${SPEC} from roadmap ${PHASE_TITLES[phaseNum]}...`)
  const specStatus = await run(
    `${CONTEXT}\n\nWrite the feature specification for "${PHASE_TITLES[phaseNum]}" to ${SPEC} (create ${DIR}/ if needed). Before writing: read ${ROADMAP} fully (§8 for this phase's scope, deliverables, touched files and exit criteria; §2–§7 for the design the phase implements; ${SPIKES} for the measured facts; §9 for the recorded decisions, which are binding). Verify every function, file and export the phase's §8 entry names with the typegraph tools (ts_navigate_to / ts_module_exports) and record what exists vs what is new in the spec.\n\nSPEC FORMAT (the repo's spec style; .specify/templates/spec-template.md is the reference, adapt it):\n- Title, one-paragraph overview, explicit scope + non-goals (what later phases own; quote the roadmap's phase boundaries).\n- Numbered functional requirements FR-001... — each one testable, each traceable to a roadmap statement (cite the section). Cover the phase's deliverables completely; do not invent extra features.\n- Numbered success criteria SC-001... — each MEASURABLE with the metric, threshold, and how it will be measured (vitest spec name, CLI command and expected output, inspector command, handshake). The roadmap's exit criteria for this phase are SCs.\n- Edge cases section (Windows + Linux paths, concurrency on the shared Langium services, stdout purity, missing files, stale caches, cold start time).\n- 'Existing components' table: component → file path → what is reused (verified, with the real exported signature).\n- 'New components' table: module → package → file path → public API sketch.\n- Open questions ONLY where the roadmap explicitly defers a decision to this phase.\n\nReturn the doc status.`,
    { label: 'specify', phase: 'Specify', schema: DOC_STATUS },
  )
  if (!specStatus) throw new Error('Specify agent failed — nothing to review')

  phase('Challenge Spec')
  const specReview = await challengeAndRevise(SPEC, 'spec', [
    { key: 'fidelity', lens: `ROADMAP FIDELITY + DECISION COVERAGE: compare every FR/SC against ${ROADMAP} §8 "${PHASE_TITLES[phaseNum]}" and the §9 decisions. Flag roadmap deliverables missing from the spec, spec content the roadmap never asked for (scope creep), content that belongs to another phase, a §9 decision contradicted, and any silently weakened threshold or exit criterion. ALSO: if the spec carries a "## Clarifications" decisions log, verify every behavioural clause of every decision is expressed by at least one FR/SC in the body — a clause living only in the log is a BLOCKER (downstream stages consume only FR/SC lists).` },
    { key: 'testability', lens: 'TESTABILITY: every FR must be verifiable by a concrete vitest spec, CLI invocation or MCP client call; every SC must state metric + threshold + measurement method with the exact command. Flag vague criteria ("works well", "fast enough") lacking an operational metric, untestable FRs, and SCs whose sketched fixture does not reproduce the real precondition (e.g. an MCP tool tested only in-process when the SC is about the stdio handshake, or a "concurrent calls" SC tested sequentially).' },
    { key: 'reality', model: MECH, lens: 'CODE REALITY: for every existing function, export, file, script or package.json command the spec cites, verify it with ts_navigate_to / ts_module_exports / ts_type_info (TypeScript) or Grep/Read (everything else). Flag invented APIs, wrong paths, wrong package, exports that do not exist in the package exports map, and scripts that are not in package.json.' },
  ], 'Challenge Spec')

  phase('Clarify Scan')
  const clar = await run(
    `${CONTEXT}\n\nYou are the CLARIFICATION scanner for ${SPEC}. Read the spec fully, the roadmap phase, and any code the spec cites. Find the places where the spec is UNDERSPECIFIED or AMBIGUOUS — where two reasonable engineers would build different things. Taxonomy to sweep: functional scope & behaviour contracts (exact semantics of each tool input/output, each generated doc), data & state (defaults, limits, caching, invalidation), non-functional (startup time, result sizes, concurrency), integration (how later phases and the clients consume this — API shape commitments), edge cases (Windows/Linux, missing files, errors), terminology (words used but never defined).\n\nRULES:\n- Max 8 questions, ranked by impact. Only questions whose answer CHANGES the implementation — no bikeshedding, no questions the roadmap §9 decisions or repo conventions already answer.\n- Each question gets 2-4 concrete options with one-line consequences, plus your recommendation.\n- Also APPEND a "## Open Clarifications" section to ${SPEC} listing the same questions verbatim (id, question, options). Later stages gate on this section until answers are encoded.\n- If the spec is genuinely unambiguous, return zero questions and do not touch the file.`,
    { label: 'clarify-scan', phase: 'Clarify Scan', schema: QUESTIONS_SCHEMA },
  )
  const questions = clar ? clar.questions : []
  log(`Clarify scan: ${questions.length} question(s) for the user`)

  return {
    stage: 'specify',
    phase: phaseNum,
    slug: SLUG,
    artifacts: { spec: SPEC },
    spec_summary: specStatus.summary,
    open_questions: specStatus.open_questions || [],
    unresolved_review_issues: specReview.unresolved,
    clarification_questions: questions,
    next: questions.length
      ? `MAIN LOOP: ask the user these ${questions.length} questions (AskUserQuestion, multiple choice, up to 4 per call, recommendation first) until every one is resolved, then run stage "plan" with args {phase: ${phaseNum}, stage: "plan", clarifications: {Q1: "<answer>", ...}}.`
      : `No ambiguities found. Run stage "plan": args {phase: ${phaseNum}, stage: "plan"}.`,
  }
}

// ===========================================================================
// STAGE: PLAN — encode clarifications → plan → challenge plan → tasks
// ===========================================================================
if (stage === 'plan') {
  const clarifications = A.clarifications || null

  phase('Encode Clarifications')
  if (clarifications) {
    await run(
      `${CONTEXT_LITE}\n\nThe user answered the open clarifications in ${SPEC}. Encode their answers into the spec:\n1. Add/extend a "## Clarifications" section with a dated session log: one line per question — the question and the user's decision.\n2. UPDATE every FR/SC/section the answer affects so the spec body itself reflects the decision (the reader must never need the log to know the behaviour).\n3. EVERY BEHAVIOURAL CLAUSE of every decision MUST be carried by at least one FR or SC — mint new FR/SC entries where none exists. The decision log is NEVER the only carrier: downstream stages (plan, tasks, comply) consume ONLY the FR/SC lists. End each log line with the enforcing ids in brackets, e.g. "[FR-017, SC-024]".\n4. DELETE the "## Open Clarifications" section entirely — every question below is now decided.\n5. Do not weaken any threshold unless the answer explicitly decides that.\n\nANSWERS (id → decision):\n${JSON.stringify(clarifications, null, 2)}`,
      { label: 'encode-clarifications', phase: 'Encode Clarifications', model: MECH },
    )
  }
  const gate = await run(
    `${CONTEXT_LITE}\n\nRead ${SPEC}. Three checks, resolved=true only if ALL pass:\n1. No "## Open Clarifications" section with unresolved questions remains.\n2. No FR/SC contradicts the "## Clarifications" decisions log (if present).\n3. COVERAGE: every behavioural clause of every "## Clarifications" decision is carried by at least one FR or SC in the spec BODY (the log lines cite their enforcing ids in brackets — verify each cited id exists AND actually expresses that clause; a decision whose clause appears nowhere outside the log is a FAILURE, name it in unresolved).`,
    { label: 'clarify-gate', phase: 'Encode Clarifications', schema: RECHECK_SCHEMA, model: MECH },
  )
  if (gate && !gate.resolved) {
    return {
      stage: 'plan',
      phase: phaseNum,
      slug: SLUG,
      status: 'BLOCKED_UNRESOLVED_CLARIFICATIONS',
      unresolved: gate.unresolved,
      next: `Spec still has open questions. Ask the user these, then re-run stage "plan" with args.clarifications covering them.`,
    }
  }

  phase('Plan')
  log(`Authoring ${PLAN}...`)
  const planStatus = await run(
    `${CONTEXT}\n\nWrite the technical implementation plan for ${SPEC} to ${PLAN}. Read the (now reviewed) spec first, then look up (typegraph) the real signatures of everything it reuses.\n\nPLAN FORMAT (.specify/templates/plan-template.md is the reference, adapt it):\n- Module-by-module design: package, file path, exported API sketch (real TypeScript signatures), how it composes the reused functions (quote their real signatures), Effect services/layers and tagged errors involved, where it runs (in-process vs child process), stdout/stderr discipline.\n- Data and generation design where the phase has generated artifacts (inputs, generator script, output paths, drift test).\n- Test plan: for each FR/SC, the spec file, describe/it names, and assertion strategy (fixtures, in-process MCP client, spawned bin, inspector command, expected verbatim output).\n- Build integration: package.json scripts, esbuild.mjs changes, package exports map, "files" list, CHANGELOG/README entries, which gates run (pnpm typecheck, pnpm run ci, vitest per package, pnpm effect:check:*, check:examples / smoke:examples / fmt:examples when relevant, test:coverage:ci).\n- Risks + mitigations (concurrency on the Langium singleton, jsdom globals, stdout pollution, startup time, Windows paths, coverage thresholds).\n\nReturn the doc status.`,
    { label: 'plan', phase: 'Plan', schema: DOC_STATUS },
  )
  if (!planStatus) throw new Error('Plan agent failed')

  phase('Challenge Plan')
  const planReview = await challengeAndRevise(PLAN, 'plan', [
    { key: 'spec-coverage', lens: `SPEC COVERAGE: map every FR/SC in ${SPEC} to a design element + test in the plan. Flag anything unaddressed, any test that could not actually detect its FR failing, and any plan element with no FR behind it.` },
    { key: 'effect-and-bundle', lens: 'EFFECT + BUNDLE DISCIPLINE: audit the proposed designs for thrown exceptions in Effect pipelines, untagged errors, Effect.gen adapter use, services not declared via Context.Service/Layer, stdout writes in a stdio server, blocking work on the shared Langium services without the semaphore, jsdom globals installed in the server process, imports from banned trees, hand-edits to generated files, and bundle breakage (a new external dependency not in packages/cli package.json "dependencies", a workspace import that esbuild.mjs WORKSPACE_SOURCES does not map, a generated file missing from the npm "files" list, a non-lazy import that slows every CLI command). Check that the plan keeps pnpm effect:check at 0/0.' },
    { key: 'reuse-reality', model: MECH, lens: 'REUSE REALITY: for every reused function the plan quotes, confirm with ts_type_info / ts_navigate_to that the signature compiles as used (parameter types, Effect error/requirement channels, export path through the package exports map). Flag any API drift between plan and reality, and any package.json script or CLI flag the plan invokes that does not exist.' },
  ], 'Challenge Plan')

  phase('Tasks')
  log(`Authoring ${TASKS}...`)
  const tasksStatus = await run(
    `${CONTEXT}\n\nWrite the dependency-ordered task list for ${PLAN} to ${TASKS}. Read spec and plan first.\n\nTASK FORMAT (.specify/templates/tasks-template.md is the reference, adapt it):\n- Tasks T001... grouped into ordered GROUPS ("Group 1 — <name>", "Group 2 — <name>", ...). Within a group, tasks marked [P] are parallel-safe: they touch fully disjoint NEW files only. Any task editing a SHARED file (package.json, an index.ts barrel, esbuild.mjs, an existing module another task also touches, AGENTS.md) goes in its own sequential group.\n- Each task is fully self-contained (the executor has no other context): exact files to create/edit, the failing test to write FIRST (spec file, describe/it names, exact assertions), then the implementation intent, then the exact command that verifies it (e.g. pnpm -C packages/cli exec vitest run src/__tests__/mcp-server.spec.ts).\n- Follow the repo's canonical order: failing test → implement → pnpm check clean → tests pass; Effect code additionally pnpm effect:check:<pkg> 0/0.\n- Last group: integration tasks — pnpm build, pnpm run ci, pnpm test, pnpm test:coverage:ci (thresholds), pnpm effect:check, the examples gates (check:examples, smoke:examples, fmt:examples) when the language package or examples changed, README/CHANGELOG entries, AGENTS.md updates the roadmap lists.\n- End with a "## Defects found" section (empty) for triage notes the gates may add later.\n\nReturn the doc status.`,
    { label: 'tasks', phase: 'Tasks', schema: DOC_STATUS },
  )
  if (!tasksStatus) throw new Error('Tasks agent failed')

  return {
    stage: 'plan',
    phase: phaseNum,
    slug: SLUG,
    artifacts: { spec: SPEC, plan: PLAN, tasks: TASKS },
    plan_summary: planStatus.summary,
    tasks_summary: tasksStatus.summary,
    unresolved_review_issues: planReview.unresolved,
    open_questions: [...(planStatus.open_questions || []), ...(tasksStatus.open_questions || [])],
    next: `User reviews ${SPEC}, ${PLAN}, ${TASKS}. Then run stage "build": args {phase: ${phaseNum}, stage: "build"}.`,
  }
}

// ===========================================================================
// STAGE: BUILD — dispatch → (implement → gate+fix)* → comply → report
// ===========================================================================
phase('Dispatch')
const dispatch = await run(
  `${CONTEXT_LITE}\n\nRead ${TASKS} (skim ${SPEC}/${PLAN} only if the task list is ambiguous). Convert tasks.md into executable task groups, preserving its group order and [P] parallel markers. For each task emit ONLY: id, title, the file list, and a 1-3 sentence orientation summary — do NOT copy the task body (executors read their own section of tasks.md; a verbatim copy overflows your output limit). A group is parallel=true only if every task in it is marked [P]. Also list the workspace packages the phase touches.`,
  { label: 'dispatch', phase: 'Dispatch', schema: TASKGROUPS_SCHEMA, model: MECH },
)
if (!dispatch || !dispatch.groups || dispatch.groups.length === 0) throw new Error(`Dispatcher produced no task groups — check ${TASKS} exists (run stages "specify" then "plan" first)`)
log(`${dispatch.groups.length} groups, ${dispatch.groups.reduce((n, g) => n + g.tasks.length, 0)} tasks, packages: ${dispatch.packages.join(', ')}`)

// ---------------------------------------------------------------------------
// Gate commands. Everything here is seconds to a few minutes, so the gate after every group
// runs the whole typecheck and lint, the touched packages' vitest, effect:check for touched
// Effect code, and the examples gates when the language package or examples changed. The final
// group runs the full set including coverage thresholds.
// ---------------------------------------------------------------------------
const norm = (f) => String(f).replace(/\\/g, '/')
const pkgOf = (f) => { const m = /^packages\/(language|cli|extension|shared-utils)\//.exec(norm(f)); return m ? m[1] : null }
const gateLog = (name, attempt) => `F:/tmp/gate/${SLUG}-${groupKey(name).replace(/[^A-Za-z0-9]+/g, '_')}-a${attempt}`

function gateCommands(group, isLast) {
  const files = group.tasks.flatMap(t => t.files || []).map(norm)
  const pkgs = new Set(files.map(pkgOf).filter(Boolean))
  const specFiles = files.filter(f => /\.spec\.ts$/.test(f))
  const effectLanguage = files.some(f => /^packages\/language\/src\/compiler\//.test(f))
  const effectCli = files.some(f => /^packages\/cli\/src\//.test(f))
  const grammar = files.some(f => /\.langium$/.test(f))
  const examples = isLast || files.some(f => /^examples\//.test(f) || /^packages\/language\//.test(f))
  const cmds = []
  if (grammar) cmds.push('pnpm langium:generate')
  cmds.push('pnpm typecheck')
  cmds.push('pnpm run ci')
  if (isLast) {
    cmds.push('pnpm test')
    cmds.push('pnpm test:coverage:ci')
  } else if (specFiles.length) {
    for (const p of ['language', 'cli', 'extension', 'shared-utils']) {
      const own = specFiles.filter(f => pkgOf(f) === p).map(f => f.replace(`packages/${p}/`, ''))
      if (own.length) cmds.push(`pnpm -C packages/${p} exec vitest run ${own.join(' ')}`)
    }
    for (const p of pkgs) if (!specFiles.some(f => pkgOf(f) === p)) cmds.push(`pnpm -C packages/${p} test`)
  } else {
    for (const p of pkgs) cmds.push(`pnpm -C packages/${p} test`)
  }
  if (effectLanguage || isLast) cmds.push('pnpm effect:check:language')
  if (effectCli || isLast) cmds.push('pnpm effect:check:cli')
  if (examples) cmds.push('pnpm run check:examples', 'pnpm run fmt:examples', 'pnpm run smoke:examples')
  return cmds
}

const EXEC_RULES = `EXECUTION RULES (violating them fails the gate):
- Run every command from the repo root (Bash: cd /f/projects/eligius/eligian), each as a FOREGROUND Bash command with timeout 600000, stdout+stderr redirected to its own log file under the gate log directory (mkdir -p first), then tail -40 that log. Read the exit code from $? of the command itself, never after a pipe.
- pnpm run ci is a read-only Biome check: ANY error or warning is a red (the fixer runs pnpm check to autofix). pnpm effect:check:* with --strict: ANY error or warning is a red.
- NEVER use run_in_background. NEVER use the Monitor tool. NEVER sleep, poll, or "hold" while waiting.
- Fix NOTHING — you are a reporter. The moment every command has finished, call StructuredOutput.`

const implResults = []
let gateResult = null

for (const group of dispatch.groups) {
  phase('Implement')
  log(`Group "${group.name}": ${group.tasks.length} task(s), ${group.parallel ? 'parallel' : 'sequential'}`)

  const runTask = (t) => () =>
    run(
      `${CONTEXT}\n\nExecute this implementation task EXACTLY. FIRST open ${TASKS} and read the full section for task ${t.id} — that section is your AUTHORITATIVE instruction (the summary below is orientation only). Artifacts for reference: ${SPEC}, ${PLAN}. Write the failing test FIRST, then implement, then run ONLY the verification command the task names (and pnpm check on the files you touched) — a dedicated gate agent runs the full gates after your group. Touch only the files the task lists. Never edit generated files; never relax a test. If the task cannot be done as written (a contradiction with the spec, a missing prerequisite, a decision only the user can take), STOP: return status "blocked" with the exact question in notes instead of improvising.${retryTasks.includes(t.id) ? ' [RETRY: the task section was rewritten after a user ruling; execute the new section.]' : ''}\n\nTASK ${t.id}: ${t.title}\nFILES: ${(t.files || []).join(', ')}\nORIENTATION: ${t.instructions}`,
      { label: `impl:${t.id}`, phase: 'Implement', schema: IMPL_RESULT },
    )

  if (group.parallel) {
    const rs = await parallel(group.tasks.map(runTask))
    implResults.push(...rs.filter(Boolean))
  } else {
    for (const t of group.tasks) {
      const r = await runTask(t)()
      if (r) implResults.push(r)
    }
  }

  const blockedHere = implResults.filter(r => r && r.status === 'blocked' && group.tasks.some(t => t.id === r.task_id) && !unblocked.includes(r.task_id))
  for (const r of implResults) if (r && r.status === 'blocked' && unblocked.includes(r.task_id) && group.tasks.some(t => t.id === r.task_id)) log(`Group "${group.name}": ${r.task_id} is blocked in the cache but listed in args.unblock — continuing (ruling recorded)`)
  if (blockedHere.length) {
    log(`Group "${group.name}": ${blockedHere.map(r => r.task_id).join(', ')} reported BLOCKED — stopping the stage`)
    return {
      stage: 'build', phase: phaseNum, slug: SLUG, status: 'BLOCKED',
      blocked_group: group.name,
      blocked_tasks: blockedHere,
      impl_results: implResults,
      next: 'A task reported status "blocked" (stop-and-surface). Read its notes, take the decision it asks for (record it in the spec FR/SC row, Clarifications, and the tasks.md section), then re-run stage "build" with resumeFromRunId and args.unblock: ["<task_id>"] (plus args.retry_tasks: ["<task_id>"] if its section was rewritten).',
    }
  }

  phase('Gate')
  const isLast = group === dispatch.groups[dispatch.groups.length - 1]
  const cmds = gateCommands(group, isLast)
  log(`Gate for "${group.name}": ${cmds.join(' · ')}`)
  let attempt = 0
  while (attempt < 4) {
    attempt++
    const out = gateLog(group.name, attempt)
    gateResult = await run(
      `${CONTEXT_LITE}\n\nGate the current tree after group "${group.name}" (gate epoch ${gateEpoch(group.name)}). Log directory: ${out}\nRun these commands in this order, all of them even if an earlier one fails:\n${cmds.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n${EXEC_RULES}${GIT_GUARD}${FLAKE_RULE}\n\nGATE SEMANTICS — later groups are NOT implemented yet:\n- A test file or script that a LATER group's task creates is not a failure; name it in summary as "not yet created (later group)".\n- typecheck_ok=false only for a real tsc error; lint_ok=false for any Biome error or warning; tests_ok=false for any failing vitest case, any effect:check finding, or a red examples gate.\n- Quote the summary line of every command verbatim.`,
      { label: `gate:${group.name}:a${attempt}`, phase: 'Gate', schema: GATE_RESULT, model: MECH },
    )
    if (!gateResult) throw new Error('Gate agent died — aborting to avoid blind fixes')
    if (gateResult.failures == null) gateResult.failures = ''
    const expectedRed = isExpectedRed(group.name)
    const green = gateResult.typecheck_ok && gateResult.lint_ok && (gateResult.tests_ok || expectedRed)
    if (green) {
      if (expectedRed && !gateResult.tests_ok) gateResult = { ...gateResult, tests_ok: true, summary: `[test-first group: red tests accepted] ${gateResult.summary}` }
      log(`Group "${group.name}" ${expectedRed ? 'green (test-first: red tests accepted, typecheck + lint clean)' : 'green'}: ${gateResult.summary}`)
      break
    }
    if (attempt >= 4) break
    log(`Group "${group.name}" red (attempt ${attempt}) — dispatching fixer`)
    const fixNote = await run(
      `${CONTEXT}\n\nThe gate is red after implementing group "${group.name}" of ${TASKS}. FIRST read the "Defects found" section at the bottom of ${TASKS} (and the spec's Clarifications): a red that is already triaged there for a LATER group, or already ruled by the user, is NOT yours — note it in one line and leave it. Then diagnose and fix the ROOT CAUSE of what remains. Rules: never weaken or delete a failing test to make it pass unless it demonstrably contradicts ${SPEC} (then say so and STOP AND SURFACE instead of editing); never relax a coverage threshold; pnpm check autofixes Biome findings; Effect findings are fixed by hand (no autofix for some rules). Re-run only the commands that were red to confirm, with the same execution rules (foreground, timeout 600000, log file, tail). If the red is NOT A CODE DEFECT (a spec contradiction or a decision only the user can take), write exactly "STOP AND SURFACE" followed by the question, and change nothing.${GIT_GUARD}\n\nGATE LOG DIRECTORY: ${out}\nGATE REPORT:\n${JSON.stringify(gateResult, null, 2)}`,
      { label: `fix:${group.name}:a${attempt}`, phase: 'Gate' },
    )
    const fixText = typeof fixNote === 'string' ? fixNote : JSON.stringify(fixNote || '')
    const fixId = `fix:${groupKey(group.name)}`
    // A red that the fixer triages to a LATER group's task (tasks.md "Red until Txxx", a test-first
    // test whose implementation comes later) is accepted for this group when typecheck and lint are
    // clean; the final group's full `pnpm test` and comply catch it if the later group never turns it
    // green. Added 2026-11-04 after Phase 0 Group 11 ran four identical "not mine to fix" rounds.
    // TODO before the next FRESH run: add `expected_red: boolean` per group to TASKGROUPS_SCHEMA so
    // the dispatcher reads it from tasks.md (changes the dispatch opts hash, so not mid-run).
    if (/later (?:group|task)|red until T\d+|not (?:a |mine to )?(?:code )?(?:defect|fix)|no defect|nothing (?:left )?to fix/i.test(fixText) && gateResult.typecheck_ok && gateResult.lint_ok) {
      log(`Group "${group.name}": fixer triaged the red to a later group — accepting (typecheck + lint clean)`)
      gateResult = { ...gateResult, tests_ok: true, summary: `[red triaged to a later group by the fixer] ${gateResult.summary}` }
      break
    }
    if (/STOP AND SURFACE|user ruling|not fixable in code|NOT A CODE DEFECT/i.test(fixText) && !unblocked.includes(fixId)) {
      log(`Group "${group.name}": fixer reports the red needs a user ruling — stopping the stage`)
      return {
        stage: 'build', phase: phaseNum, slug: SLUG, status: 'BLOCKED',
        blocked_group: group.name,
        blocked_tasks: [{ task_id: fixId, status: 'blocked', files_written: [], notes: fixText }],
        last_gate: gateResult,
        impl_results: implResults,
        next: `The fixer reports a spec contradiction. Take the ruling, amend spec/plan/tasks and the test, then re-run stage "build" with resumeFromRunId, args.unblock including "${fixId}" and args.gate_epochs {"${groupKey(group.name)}": 2} so this group's gate is re-measured.`,
      }
    }
  }
  if (!(gateResult.typecheck_ok && gateResult.lint_ok && gateResult.tests_ok)) {
    return {
      stage: 'build', phase: phaseNum, slug: SLUG, status: 'FAILED_RED_TREE',
      failed_group: group.name,
      last_gate: gateResult,
      impl_results: implResults,
      next: 'Tree is red after 4 fix attempts. Inspect failures, fix in the main loop, then re-run stage "build" with resumeFromRunId and args.gate_epochs for this group.',
    }
  }
}

// ---------------------------------------------------------------------------
// Comply — adversarial verification of every FR/SC against the real tree.
// ---------------------------------------------------------------------------
phase('Comply')
const complyLenses = [
  { key: 'fr', what: `every FR-xxx in ${SPEC}: open the implementation, read the code, confirm the requirement is met. Evidence = file:line + a one-sentence proof from the code you quote.` },
  { key: 'sc', what: `every SC-xxx in ${SPEC}: RUN the specific test or command yourself (a single spec file via pnpm -C packages/<pkg> exec vitest run <file>; a CLI command via node packages/cli/bin/cli.js ...; an MCP handshake via the inspector or the in-process client the plan names) and paste the ACTUAL output vs the threshold. Never paraphrase output. Foreground Bash, timeout 600000, output to a log file, tail it.` },
  { key: 'constraints', what: `the cross-cutting constraints: run pnpm typecheck, pnpm run ci, pnpm effect:check and pnpm test:coverage:ci and report their verbatim last lines (0 errors / 0 warnings / thresholds met are each an item); grep the diff for imports from ../eligius/src or f:/projects/typir and for edits under **/generated/ (each an item); confirm no stdout writes outside protocol frames in any MCP server module (grep for console.log / process.stdout.write under packages/cli/src/mcp); confirm every new dependency is in packages/cli package.json "dependencies" and every generated artifact is in its "files" list (if the phase produced any).` },
]
const complyResults = await parallel(
  complyLenses.map(l => () =>
    run(
      `${CONTEXT}\n\nYou are the COMPLIANCE verifier. Default verdict is FAIL until you personally verify otherwise — assume the implementers cut corners. Verify ${l.what}\n\nAn item without concrete evidence (real file:line, real command output) must be verdict "fail" with evidence explaining what is missing.`,
      { label: `comply:${l.key}`, phase: 'Comply', schema: COMPLY_SCHEMA },
    ).then(r => r.items.map(i => ({ ...i, lens: l.key }))),
  ),
)
const complyItems = complyResults.filter(Boolean).flat()
const failures = complyItems.filter(i => i.verdict !== 'pass')
log(`Compliance: ${complyItems.length - failures.length}/${complyItems.length} pass, ${failures.length} fail/partial`)

let finalItems = complyItems
if (failures.length > 0) {
  log('Dispatching remediation for failing compliance items...')
  await run(
    `${CONTEXT}\n\nFix these compliance failures against ${SPEC}. Same rules as always: failing test first where a behaviour is wrong, no threshold relaxing, no test deletion, pnpm check clean, tree must stay green (re-run pnpm typecheck, pnpm run ci and the touched packages' tests after your fix, foreground, timeout 600000, log file, tail).\n\nTRIAGE FIRST: sort every item into one of three classes before touching anything.\n- WORDING: the spec's FR/SC row still says what a recorded Clarifications ruling superseded. Fix = amend the row to the ruling; no code change.\n- CODE: the implementation does not meet the row. Fix = code + test.\n- RULING NEEDED: the row and the code disagree and no ruling exists. Do not guess: write "STOP AND SURFACE" with the question and leave it.\n\nITEMS:\n${JSON.stringify(failures, null, 2)}`,
    { label: 'remediate', phase: 'Comply' },
  )
  const reverify = await run(
    `${CONTEXT}\n\nRe-verify ONLY these previously-failing compliance items with the same evidence standard (real file:line, real command output run by you). Also confirm pnpm typecheck, pnpm run ci and pnpm test are still green (run them, quote the summary lines).\n\nITEMS:\n${JSON.stringify(failures, null, 2)}`,
    { label: 'reverify', phase: 'Comply', schema: COMPLY_SCHEMA },
  )
  if (reverify) {
    const reMap = new Map(reverify.items.map(i => [i.id, i]))
    finalItems = complyItems.map(i => reMap.has(i.id) ? { ...reMap.get(i.id), lens: i.lens } : i)
  }
}
const finalFailures = finalItems.filter(i => i.verdict !== 'pass')

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
phase('Report')
const report = await run(
  `${CONTEXT_LITE}\n\nWrite the compliance report to ${COMPLIANCE} and return the same markdown. Content:\n- Header: ${PHASE_TITLES[phaseNum]} (${SLUG}), overall status (COMPLETE only if zero fail/partial items — otherwise INCOMPLETE with the honest gap list first).\n- Compliance table: one row per item below, with its verbatim evidence. Do not soften any fail.\n- Implementation notes: deviations reported by task agents.\n- Remaining steps for the human loop: review the diff, commit (the workflow never commits).\n\nITEMS:\n${JSON.stringify(finalItems, null, 2)}\n\nTASK NOTES:\n${JSON.stringify(implResults.map(r => ({ task: r.task_id, status: r.status, notes: r.notes })), null, 2)}`,
  { label: 'report', phase: 'Report', schema: DOC_SCHEMA, model: MECH },
)

if (finalFailures.length === 0) {
  await run(
    `You are in the Eligian monorepo at ${ROOT}. The implementation of "${PHASE_TITLES[phaseNum]}" of the presentation assistant roadmap is verified complete. Edit ${ROADMAP}: directly under the heading line that starts with "### ${PHASE_TITLES[phaseNum].split(' — ')[0]} —" insert one line: "**Status: ✅ COMPLETE (<today's date YYYY-MM-DD, from the date command>)** — see ${COMPLIANCE}". Change nothing else.`,
    { label: 'mark-roadmap', phase: 'Report', model: TRIVIAL },
  )
  log(`Roadmap phase ${phaseNum} marked COMPLETE`)
} else {
  log(`Phase INCOMPLETE — roadmap NOT updated (${finalFailures.length} failing item(s))`)
}

return {
  stage: 'build',
  phase: phaseNum,
  slug: SLUG,
  status: finalFailures.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
  roadmap_updated: finalFailures.length === 0,
  compliance: { pass: finalItems.length - finalFailures.length, fail_or_partial: finalFailures.length, failures: finalFailures },
  last_gate: gateResult,
  report_path: COMPLIANCE,
  report_markdown: report ? report.markdown : null,
  next: finalFailures.length === 0
    ? 'Review the diff + compliance.md, then the user commits.'
    : 'INCOMPLETE — read failures above; fix in the main loop or re-run stage "build" after addressing.',
}
