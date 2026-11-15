/**
 * Spec 058 Phase 4 (FR-025, FR-026, I-7; plan C3): the `new-presentation` prompt.
 *
 * One required argument, `idea`; the content is one user message: the idea, then the roadmap §5
 * workflow as twelve numbered steps. Every tool name and doc id in the text is interpolated from
 * `TOOL` / `DOC`, and `NEW_PRESENTATION.tools` / `.docIds` are their values, so the arrays and the
 * text have one source (SC-012).
 *
 * `McpServer.prompt` is `@stability unstable` (roadmap decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import { Effect, Schema } from 'effect';
import type { EffectAi } from './paths.js';

const TOOL = {
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
  storyboard: 'storyboard',
  decisions: 'decisions',
  projectLayout: 'project-layout',
  runtimeStatePitfalls: 'runtime-state-pitfalls',
} as const;

const text = (idea: string): string => `Build an Eligius presentation with Eligian for this idea:
${idea}

Work through these steps in order; do not skip a gate.
1. Call \`${TOOL.docs}\` with ids "${DOC.storyboard}", "${DOC.decisions}" and "${DOC.projectLayout}" and read them before writing anything.
2. Write STORYBOARD.md in the project: the header (audience, provider and why, languages, assets, host module), one beat table per view and an interactions table. It is the spec.
3. Call \`${TOOL.init}\` with the starter the provider choice in "${DOC.decisions}" points to.
4. Call \`${TOOL.project}\` to confirm the inventory and the asset files.
5. Write the layout and the CSS first: one container per timeline, an id for everything a timeline selects, state classes in the CSS.
6. Write the timelines one view at a time; before using an operation you have not used yet, look it up with \`${TOOL.operations}\` (batch the names in one call).
7. Run \`${TOOL.check}\` until it reports 0 errors and 0 warnings; apply the fixes it attaches.
8. Once the first timeline passes, call \`${TOOL.compile}\` with \`select\` and \`explain: true\` once and compare the operations with the storyboard.
9. Call \`${TOOL.fmt}\` with \`write: true\`.
10. Call \`${TOOL.smoke}\` with a scenario per interaction and \`determinism: true\`; fix every problem at the source it names.
11. For a human look, start \`npx eligian dev main.eligian\` (it keeps running and rebuilds on save); the page's runtime errors land in \`.eligian/dev-errors.json\`, read it after each change.
12. Before declaring done, compare STORYBOARD.md with \`${TOOL.project}\`'s storyboard section and the compiled timelines, and read "${DOC.runtimeStatePitfalls}" with \`${TOOL.docs}\`.
`;

/** The prompt's name, metadata, the doc ids and tools its text names, and the text (FR-025). */
export const NEW_PRESENTATION = {
  name: 'new-presentation',
  title: 'New Eligian presentation',
  description:
    'Plan, build and verify a new Eligian presentation from an idea: storyboard, starter, ' +
    'layout, timelines, then check, compile, fmt, smoke and dev.',
  docIds: Object.values(DOC),
  tools: Object.values(TOOL),
  text,
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
