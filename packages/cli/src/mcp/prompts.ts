/**
 * Spec 058 Phase 4 (FR-025, FR-026, I-7; plan C3): the `new-presentation` prompt. Spec 059
 * Phase 3 (FR-007, FR-008): its first steps are the brief interview, the storyboard draft and its
 * approval (fourteen steps), and the `add-to-presentation` prompt for additions.
 *
 * Each prompt has one required argument (`idea`, `addition`); the content is one user message:
 * the argument, then numbered steps. Every tool name and doc id in a text is interpolated from
 * `TOOL` / `DOC` (or a subset of them), and each prompt's `.tools` / `.docIds` are those values,
 * so the arrays and the text have one source (spec 058 SC-012).
 *
 * `McpServer.prompt` is `@stability unstable` (roadmap decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import { Effect, Schema } from 'effect';
import type { EffectAi } from './paths.js';

const TOOL = {
  brief: 'eligian_brief',
  docs: 'eligian_docs',
  init: 'eligian_init',
  project: 'eligian_project',
  operations: 'eligian_operations',
  check: 'eligian_check',
  compile: 'eligian_compile',
  fmt: 'eligian_fmt',
  smoke: 'eligian_smoke',
} as const;

const DOC = {
  interview: 'interview',
  storyboard: 'storyboard',
  decisions: 'decisions',
  projectLayout: 'project-layout',
  runtimeStatePitfalls: 'runtime-state-pitfalls',
} as const;

const text = (idea: string): string => `Build an Eligius presentation with Eligian for this idea:
${idea}

Work through these steps in order; do not skip a gate.
1. Call \`${TOOL.brief}\` with \`action: status\` and the idea above verbatim as \`idea\`; read "${DOC.interview}" with \`${TOOL.docs}\` before the first round.
2. Ask each round in one message: every question with your recommended answer worded so that "yes" accepts it. Look facts up (\`${TOOL.project}\`, the files) instead of asking. Record the replies with \`action: answer\` (a "you decide" as \`delegated: true\` with your choice), until the state is \`complete\`.
3. Call \`${TOOL.brief}\` with \`action: confirm\`: the user confirms in a dialog, or you show the counts and the delegated answers and pass their reply verbatim as \`confirmation\`.
4. Read "${DOC.storyboard}", "${DOC.decisions}" and "${DOC.projectLayout}" with \`${TOOL.docs}\`, draft STORYBOARD.md from the brief, and call \`${TOOL.brief}\` with \`action: approve-storyboard\`.
5. Call \`${TOOL.init}\` with the starter the provider choice in "${DOC.decisions}" points to.
6. Call \`${TOOL.project}\` to confirm the inventory and the asset files.
7. Write the layout and the CSS first: one container per timeline, an id for everything a timeline selects, state classes in the CSS.
8. Write the timelines one view at a time; before using an operation you have not used yet, look it up with \`${TOOL.operations}\` (batch the names in one call).
9. Run \`${TOOL.check}\` until it reports 0 errors and 0 warnings; apply the fixes it attaches.
10. Once the first timeline passes, call \`${TOOL.compile}\` with \`select\` and \`explain: true\` once and compare the operations with the storyboard.
11. Call \`${TOOL.fmt}\` with \`write: true\`.
12. Call \`${TOOL.smoke}\` with a scenario per interaction and \`determinism: true\`; fix every problem at the source it names.
13. For a human look, start \`npx eligian dev main.eligian\` (it keeps running and rebuilds on save); the page's runtime errors land in \`.eligian/dev-errors.json\`, read it after each change.
14. Before declaring done, compare STORYBOARD.md with \`${TOOL.project}\`'s storyboard section and the compiled timelines, and read "${DOC.runtimeStatePitfalls}" with \`${TOOL.docs}\`.
`;

/** The prompt's name, metadata, the doc ids and tools its text names, and the text (FR-025). */
export const NEW_PRESENTATION = {
  name: 'new-presentation',
  title: 'New Eligian presentation',
  description:
    'Plan, build and verify a new Eligian presentation from an idea: the brief interview, ' +
    'storyboard, starter, layout, timelines, then check, compile, fmt, smoke and dev.',
  docIds: Object.values(DOC),
  tools: Object.values(TOOL),
  text,
} as const;

/** The tools and docs `add-to-presentation` names (spec 059 FR-008): a subset of `TOOL` / `DOC`. */
const ADD_TOOL = {
  project: TOOL.project,
  brief: TOOL.brief,
  docs: TOOL.docs,
  check: TOOL.check,
  fmt: TOOL.fmt,
  smoke: TOOL.smoke,
} as const;

const ADD_DOC = {
  interview: DOC.interview,
  storyboard: DOC.storyboard,
} as const;

const additionText = (addition: string): string => `Add to an existing Eligius presentation:
${addition}

Work through these steps in order; do not skip a gate.
1. Call \`${ADD_TOOL.project}\` on the program to see its views, languages and host module.
2. Decide which addition this is: a new view, a new language or a first host module. A change inside an existing view is an edit and needs no interview: make it, then go to step 4.
3. Call \`${ADD_TOOL.brief}\` with \`scope: { "addition": "view" | "language" | "host-module", "name": "<name>" }\` and \`action: status\` (read "${ADD_DOC.interview}" with \`${ADD_TOOL.docs}\` first); ask each round in one message with your recommended answers, record the replies with \`action: answer\` until the state is \`complete\`, call \`action: confirm\`, add the addition's section to STORYBOARD.md (see "${ADD_DOC.storyboard}") and call \`action: approve-storyboard\`, passing the same \`scope\` on every call.
4. Write the code, then run \`${ADD_TOOL.check}\` until it reports 0 errors and 0 warnings, \`${ADD_TOOL.fmt}\` with \`write: true\`, and \`${ADD_TOOL.smoke}\` with a scenario per interaction.
`;

/** The `add-to-presentation` prompt (spec 059 FR-008): metadata, its doc ids and tools, the text. */
export const ADD_TO_PRESENTATION = {
  name: 'add-to-presentation',
  title: 'Add to an Eligian presentation',
  description:
    'Add a new view, a new language or a first host module to an existing Eligian presentation: ' +
    'the scoped brief interview, its storyboard section, then the code, check, fmt and smoke.',
  docIds: Object.values(ADD_DOC),
  tools: Object.values(ADD_TOOL),
  text: additionText,
} as const;

/** The layer that registers the `new-presentation` prompt (FR-025, FR-026: `idea` non-empty). */
export const newPresentationPrompt = (ai: EffectAi) =>
  ai.McpServer.prompt({
    name: NEW_PRESENTATION.name,
    title: NEW_PRESENTATION.title,
    description: NEW_PRESENTATION.description,
    parameters: {
      idea: Schema.NonEmptyString.annotate({
        description: 'The presentation idea in your own words',
      }),
    },
    content: ({ idea }) => Effect.succeed(NEW_PRESENTATION.text(idea)),
  });

/** The layer that registers the `add-to-presentation` prompt (spec 059 FR-008: `addition` non-empty). */
export const addToPresentationPrompt = (ai: EffectAi) =>
  ai.McpServer.prompt({
    name: ADD_TO_PRESENTATION.name,
    title: ADD_TO_PRESENTATION.title,
    description: ADD_TO_PRESENTATION.description,
    parameters: {
      addition: Schema.NonEmptyString.annotate({
        description: 'What to add, in your own words',
      }),
    },
    content: ({ addition }) => Effect.succeed(ADD_TO_PRESENTATION.text(addition)),
  });
