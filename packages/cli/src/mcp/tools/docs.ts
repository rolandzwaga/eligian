/**
 * Spec 058 Phase 1 (FR-019; plan C9 "docs"): the `eligian_docs` tool.
 *
 * No argument → the index: every `index.json` entry except the operations (Phase 2 FR-077
 * ruling: `eligian_operations` has them; `operations.count` and `operations.see` say so),
 * `kind: example` entries (FR-075) as `{ id, title }` only, the others as
 * `{ id, title, kind, card }`. `ids` →
 * their cards, or with `detail` their bodies up to 6,000 words per response (the rest in
 * `notReturned`). `query` → the top 8 search hits with their cards. Unknown ids come back with the 3 closest known ids. Several
 * inputs in one call are answered together in one payload.
 *
 * `Tool` is `@stability unstable` (roadmap decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import { findSimilarClasses } from '@eligian/language';
import { Effect, Schema } from 'effect';
import { type ToolError, ToolFailure } from '../errors.js';
import { loadKnowledge } from '../knowledge/load.js';
import { searchIndex } from '../knowledge/search.js';
import type { IndexEntry, Knowledge } from '../knowledge/types.js';
import type { EffectAi } from '../paths.js';

export const NAME = 'eligian_docs' as const;

export const KEYWORDS: readonly string[] = ['eligian', 'docs', 'eligius'];

export const DESCRIPTION =
  'Eligian docs: the curated knowledge for writing Eligian (.eligian) and Eligius presentations. ' +
  'No arguments: the index (one card per chunk; examples by id and title; operations are not ' +
  'listed, `eligian_operations` has them). ' +
  'ids (at most 6): their cards; with detail: true their full bodies, up to 6,000 words per ' +
  'response, the rest listed in notReturned. query: the 8 best matching chunks with their ' +
  'cards. Unknown ids come back with the closest known ids. Read `syntax-cheatsheet` and ' +
  '`operations-index` before writing Eligian; never write it from memory.';

/** The most words of chunk bodies one `detail` response returns (FR-019). */
const BODY_WORD_CAP = 6000;
/** The closest known ids listed for an unknown id. */
const CLOSEST = 3;

export const Parameters = Schema.Struct({
  ids: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(6))),
  detail: Schema.optionalKey(Schema.Boolean),
  query: Schema.optionalKey(Schema.String),
});

const IndexItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  kind: Schema.optionalKey(Schema.String),
  use_cases: Schema.optionalKey(Schema.Array(Schema.String)),
  words: Schema.optionalKey(Schema.Finite),
  see: Schema.optionalKey(Schema.Array(Schema.String)),
  card: Schema.optionalKey(Schema.String),
});

export const Success = Schema.Struct({
  header: Schema.String,
  index: Schema.optionalKey(Schema.Array(IndexItem)),
  /** No arguments: the operations are not in `index` (FR-077 ruling); this says where they are */
  operations: Schema.optionalKey(Schema.Struct({ count: Schema.Finite, see: Schema.String })),
  cards: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, card: Schema.String }))
  ),
  bodies: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, body: Schema.String }))
  ),
  hits: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        title: Schema.String,
        heading: Schema.optionalKey(Schema.String),
        card: Schema.String,
      })
    )
  ),
  notReturned: Schema.optionalKey(Schema.Array(Schema.String)),
  unknown: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Schema.String, closest: Schema.Array(Schema.String) }))
  ),
});

type Params = typeof Parameters.Type;
type Payload = typeof Success.Type;

export interface ToolContext {
  readonly ai: EffectAi;
  readonly cwd: string;
  readonly docsRoot: URL | string;
  readonly versions: { readonly compiler: string; readonly eligius: string };
  /** The per-server call id (plan C12) */
  readonly requestId: string;
}

export const header = (versions: ToolContext['versions']): string =>
  `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · -`;

/** The telemetry summary of a call: the arguments as given (no file contents to drop). */
export const summarizeArgs = (params: Params): Readonly<Record<string, unknown>> => ({
  ...(params.ids === undefined ? {} : { ids: params.ids }),
  ...(params.detail === undefined ? {} : { detail: params.detail }),
  ...(params.query === undefined ? {} : { query: params.query }),
});

export const makeTool = (ai: EffectAi) =>
  ai.Tool.make(NAME, {
    description: DESCRIPTION,
    parameters: Parameters,
    success: Success,
    failure: ToolFailure,
  })
    .annotate(ai.Tool.Readonly, true)
    .annotate(ai.Tool.Meta, { 'anthropic/alwaysLoad': true });

/** Kinds listed by id and title only: their cards come through `ids` (or `eligian_operations`). */
const TITLE_ONLY: ReadonlySet<IndexEntry['kind']> = new Set(['operation', 'example']);

/**
 * An index item (FR-077, ruling 2026-11-05): a chunk is listed with its id, title, kind and
 * card only. `use_cases`, `words` and `see` are detail data (`ids`), so the no-argument
 * index stays within its 12,000-character budget with the Phase 2 chunks.
 */
const indexItem = (entry: IndexEntry): typeof IndexItem.Type =>
  TITLE_ONLY.has(entry.kind)
    ? { id: entry.id, title: entry.title }
    : { id: entry.id, title: entry.title, kind: entry.kind, card: entry.card };

/** The bodies that fit in the word cap, in request order; the rest by id. */
const bodiesOf = (knowledge: Knowledge, entries: readonly IndexEntry[]) => {
  const bodies: { id: string; title: string; body: string }[] = [];
  const notReturned: string[] = [];
  let words = 0;
  for (const entry of entries) {
    const body = knowledge.body(entry.id);
    if (body !== undefined && words + entry.words <= BODY_WORD_CAP) {
      bodies.push({ id: entry.id, title: entry.title, body });
      words += entry.words;
    } else {
      notReturned.push(entry.id);
    }
  }
  return { bodies, notReturned };
};

const answer = (params: Params, knowledge: Knowledge, head: string): Payload => {
  const byId = new Map(knowledge.index.map(entry => [entry.id, entry] as const));
  const ids = params.ids ?? [];
  const query = params.query?.trim() ?? '';
  if (ids.length === 0 && query === '') {
    // FR-077 (ruling 2026-11-05): the operations are not listed; they have their own tool.
    // Their ids still resolve through `ids`.
    const listed = knowledge.index.filter(entry => entry.kind !== 'operation');
    return {
      header: head,
      index: listed.map(indexItem),
      operations: {
        count: knowledge.index.length - listed.length,
        see: "eligian_operations({}) lists them by category; eligian_docs({ ids: ['operation/<name>'] }) or eligian_operations({ names: [...] }) for a card",
      },
    };
  }

  const known = [...new Set(ids)].flatMap(id => byId.get(id) ?? []);
  const unknown = [...new Set(ids)]
    .filter(id => !byId.has(id))
    .map(id => ({
      id,
      closest: findSimilarClasses(id, new Set(byId.keys()), Number.POSITIVE_INFINITY, CLOSEST),
    }));

  const detail = ids.length > 0 && params.detail === true ? bodiesOf(knowledge, known) : undefined;
  const hits =
    query === ''
      ? undefined
      : searchIndex(knowledge, query).flatMap(hit => {
          const entry = byId.get(hit.id);
          if (entry === undefined) return [];
          return [
            {
              id: entry.id,
              title: entry.title,
              ...(hit.heading === undefined ? {} : { heading: hit.heading }),
              card: entry.card,
            },
          ];
        });

  return {
    header: head,
    ...(ids.length > 0 && detail === undefined
      ? { cards: known.map(entry => ({ id: entry.id, title: entry.title, card: entry.card })) }
      : {}),
    ...(detail === undefined ? {} : { bodies: detail.bodies }),
    ...(hits === undefined ? {} : { hits }),
    ...(detail === undefined || detail.notReturned.length === 0
      ? {}
      : { notReturned: detail.notReturned }),
    ...(unknown.length === 0 ? {} : { unknown }),
  };
};

export const handle = (params: Params, context: ToolContext): Effect.Effect<Payload, ToolError> =>
  loadKnowledge(context.docsRoot).pipe(
    Effect.map(knowledge => answer(params, knowledge, header(context.versions)))
  );
