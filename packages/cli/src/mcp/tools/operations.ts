/**
 * Spec 058 Phase 1 (FR-020–FR-022, FR-037; plan C5, C9): `eligian_operations`, the operation
 * registry and the language data (controllers, timeline events, DOM events, key names) as an
 * MCP tool.
 *
 * Operation cards lead with NEEDS / PROVIDES / ERASES (`operationCard`, shared with the docs
 * generator). With `path`, the program is parsed (not loaded into the workspace, C5) under the
 * compiler lock, so the host operations and controllers of its `extensions` import count.
 * Phase 2 (FR-073, FR-074; plan F1): operation and controller cards carry their overlay from
 * the docs (`loadKnowledge`); a controller's status line comes from its overlay only.
 *
 * `Tool` is `@stability unstable`; the server is built on it (roadmap §2, decision 1: `effect` is
 * pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import * as fs from 'node:fs/promises';
import {
  controllerMetadata,
  findOperationsWithDependency,
  findOperationsWithOutput,
  findSimilarClasses,
  getOperationSignature,
  getOperationsByCategory,
  hostOperations,
  type OperationSignature,
  type Program,
  searchOperations,
  suggestSimilarOperations,
} from '@eligian/language';
import {
  CONTROLLERS,
  DOM_EVENTS,
  getOrCreateServices,
  hostControllers,
  hostFunctions,
  KEY_COMPLETIONS,
  TIMELINE_EVENTS,
} from '@eligian/language/mcp';
import { Effect, Schema } from 'effect';
import { CompilerLock } from '../compiler-lock.js';
import { type ToolError, ToolFailure, toToolError } from '../errors.js';
import { loadKnowledge } from '../knowledge/load.js';
import { controllerCard, eventLine, eventName, operationCard } from '../knowledge/render.js';
import type { Knowledge } from '../knowledge/types.js';
import { type EffectAi, projectRoot, resolveInputPath } from '../paths.js';

/** What every tool handler receives from the server (plan C9). */
export interface ToolContext {
  readonly ai: EffectAi;
  readonly cwd: string;
  readonly docsRoot: URL | string;
  readonly versions: { readonly compiler: string; readonly eligius: string };
  readonly requestId: string;
}

export const NAME = 'eligian_operations' as const;

export const DESCRIPTION =
  'Look up Eligian operations BEFORE calling one you have not used yet: each card starts with ' +
  'NEEDS / PROVIDES / ERASES (the operationData an operation reads, writes and removes), then ' +
  'its parameters, the call form and the description. `names` batches lookups; an unknown name ' +
  'comes back with suggestions. Filters `query` (name contains), `category`, `needs` and ' +
  '`provides` intersect. `kind` lists the other names: `controller` (with status), `event` ' +
  '(timeline events), `dom-event`, `key`. `path` (an .eligian file) adds the host operations, ' +
  'controllers and functions its `extensions` import declares. No argument: the operation names by category. ' +
  'At most 25 cards per call; the rest are named in `notReturned`.';

export const KEYWORDS: readonly string[] = ['operations', 'needs', 'provides', 'erases'];

/** At most this many cards per response; the rest are named in `notReturned` (plan C9). */
export const MAX_CARDS = 25;

const KINDS = ['operation', 'controller', 'event', 'dom-event', 'key'] as const;

export const Parameters = Schema.Struct({
  names: Schema.optionalKey(Schema.Array(Schema.String)),
  query: Schema.optionalKey(Schema.String),
  category: Schema.optionalKey(Schema.String),
  needs: Schema.optionalKey(Schema.String),
  provides: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.Literals(KINDS)),
  path: Schema.optionalKey(Schema.String),
});
type OperationsParameters = typeof Parameters.Type;

const Card = Schema.Struct({ name: Schema.String, kind: Schema.String, text: Schema.String });
const Unknown = Schema.Struct({ name: Schema.String, suggestions: Schema.Array(Schema.String) });
const Entry = Schema.Struct({ name: Schema.String, description: Schema.String });

export const Success = Schema.Struct({
  header: Schema.String,
  cards: Schema.Array(Card),
  unknown: Schema.Array(Unknown),
  entries: Schema.optionalKey(Schema.Array(Entry)),
  categories: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(Schema.String))),
  notReturned: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Where to read on (no argument): the `operations-index` docs chunk */
  see: Schema.optionalKey(Schema.String),
});
type OperationsSuccess = typeof Success.Type;
type CardValue = typeof Card.Type;
type UnknownValue = typeof Unknown.Type;
type EntryValue = typeof Entry.Type;

const SEE_INDEX =
  "eligian_docs({ ids: ['operations-index'] }) explains the categories and the dataflow; " +
  'pass `names` here for the cards.';

export const summarizeArgs = (params: OperationsParameters): Readonly<Record<string, unknown>> => ({
  ...(params.names === undefined ? {} : { names: params.names.length }),
  ...(params.query === undefined ? {} : { query: params.query }),
  ...(params.category === undefined ? {} : { category: params.category }),
  ...(params.needs === undefined ? {} : { needs: params.needs }),
  ...(params.provides === undefined ? {} : { provides: params.provides }),
  ...(params.kind === undefined ? {} : { kind: params.kind }),
  ...(params.path === undefined ? {} : { path: true }),
});

export const makeTool = (ai: EffectAi) =>
  ai.Tool.make(NAME, {
    description: DESCRIPTION,
    parameters: Parameters,
    success: Success,
    failure: ToolFailure,
    dependencies: [CompilerLock],
  })
    .annotate(ai.Tool.Meta, { 'anthropic/alwaysLoad': true })
    .annotate(ai.Tool.Readonly, true)
    .annotate(ai.Tool.Destructive, false);

const header = (context: ToolContext, resolvedPath: string | undefined): string =>
  `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · ${NAME} · ${resolvedPath ?? '-'}`;

/** The registry operations plus, with a program, its host operations (C5), and the overlays. */
interface Lookup {
  readonly program: Program | undefined;
  readonly hostSignatures: readonly OperationSignature[];
  readonly overlays: Pick<Knowledge['overlays'], 'operations' | 'controllers'>;
}

const names = (signatures: readonly OperationSignature[]): string[] =>
  signatures.map(signature => signature.systemName);

/** A registry operation: found without a program (a host one needs its program). */
const isRegistryOperation = (name: string): boolean => getOperationSignature(name) !== undefined;

function operationCardOf(name: string, lookup: Lookup): CardValue | undefined {
  const signature = getOperationSignature(name, lookup.program);
  if (signature === undefined) return hostFunctionCardOf(name, lookup);
  const host = !isRegistryOperation(name);
  return {
    name,
    kind: host ? 'host-operation' : 'operation',
    text: operationCard(signature, { host, overlay: lookup.overlays.operations[name] }),
  };
}

/** A host `function` the program's `extensions` import declares (FR-022): not an operation. */
function hostFunctionCardOf(name: string, lookup: Lookup): CardValue | undefined {
  const declaration = hostFunctions(lookup.program).find(fn => fn.name === name);
  if (declaration === undefined) return undefined;
  const modulePath = (declaration.$container as { path?: string } | undefined)?.path ?? '?';
  return {
    name,
    kind: 'host-function',
    text:
      `Host function \`${name}\`, declared by \`extensions "${modulePath}"\`: a function the host ` +
      'module exports and registers with the engine. It is not an operation: it has no NEEDS / ' +
      'PROVIDES / ERASES and is not called from an operation list.',
  };
}

/** The operation names the filters select, in the order of the first filter (they intersect). */
function filtered(params: OperationsParameters, lookup: Lookup): string[] | undefined {
  const lists: string[][] = [];
  if (params.query !== undefined) {
    const query = params.query.toLowerCase();
    lists.push([
      ...names(searchOperations(params.query)),
      ...names(lookup.hostSignatures.filter(s => s.systemName.toLowerCase().includes(query))),
    ]);
  }
  if (params.category !== undefined) {
    const category = params.category;
    lists.push([
      ...names(getOperationsByCategory()[category] ?? []),
      ...names(lookup.hostSignatures.filter(s => s.category === category)),
    ]);
  }
  if (params.needs !== undefined) lists.push(names(findOperationsWithDependency(params.needs)));
  if (params.provides !== undefined) lists.push(names(findOperationsWithOutput(params.provides)));
  if (lists.length === 0) return undefined;
  const [first, ...rest] = lists;
  return first.filter(name => rest.every(list => list.includes(name)));
}

function categories(lookup: Lookup): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [category, signatures] of Object.entries(getOperationsByCategory())) {
    result[category] = names(signatures);
  }
  for (const signature of lookup.hostSignatures) {
    const category = signature.category ?? 'Host';
    result[category] = [...(result[category] ?? []), signature.systemName];
  }
  return result;
}

function operationsAnswer(
  params: OperationsParameters,
  lookup: Lookup
): Omit<OperationsSuccess, 'header'> {
  const requested = params.names ?? [];
  const selected = filtered(params, lookup);
  if (requested.length === 0 && selected === undefined) {
    return { cards: [], unknown: [], categories: categories(lookup), see: SEE_INDEX };
  }
  const cards: CardValue[] = [];
  const unknown: UnknownValue[] = [];
  for (const name of new Set([...requested, ...(selected ?? [])])) {
    const card = operationCardOf(name, lookup);
    if (card) cards.push(card);
    else unknown.push({ name, suggestions: suggestSimilarOperations(name) });
  }
  const notReturned = cards.slice(MAX_CARDS).map(card => card.name);
  return {
    cards: cards.slice(0, MAX_CARDS),
    unknown,
    ...(notReturned.length === 0 ? {} : { notReturned }),
  };
}

function entriesOf(
  kind: Exclude<OperationsParameters['kind'], 'operation' | undefined>,
  lookup: Lookup
): EntryValue[] {
  switch (kind) {
    case 'controller': {
      const host = hostControllers(lookup.program).flatMap(declaration => {
        const metadata = controllerMetadata(declaration.name, lookup.program);
        return metadata ? [metadata] : [];
      });
      return [...CONTROLLERS, ...host].map(metadata => ({
        name: metadata.name,
        description: controllerCard(metadata, lookup.overlays.controllers[metadata.name]),
      }));
    }
    case 'event':
      return TIMELINE_EVENTS.map(event => ({
        name: eventName(event),
        description: eventLine(event),
      }));
    case 'dom-event':
      return [...DOM_EVENTS].map(([name, description]) => ({ name, description }));
    case 'key':
      return [...KEY_COMPLETIONS].map(([name, description]) => ({ name, description }));
  }
}

/** Entries of a non-operation kind; `names` narrows them, a missing name gets the closest ones. */
function entriesAnswer(
  kind: Exclude<OperationsParameters['kind'], 'operation' | undefined>,
  params: OperationsParameters,
  lookup: Lookup
): Omit<OperationsSuccess, 'header'> {
  const all = entriesOf(kind, lookup);
  if (params.names === undefined) return { cards: [], unknown: [], entries: all };
  const known = new Set(all.map(entry => entry.name));
  const requested = new Set(params.names);
  return {
    cards: [],
    unknown: [...requested]
      .filter(name => !known.has(name))
      .map(name => ({ name, suggestions: findSimilarClasses(name, known) })),
    entries: all.filter(entry => requested.has(entry.name)),
  };
}

function answer(params: OperationsParameters, lookup: Lookup): Omit<OperationsSuccess, 'header'> {
  const kind = params.kind;
  return kind === undefined || kind === 'operation'
    ? operationsAnswer(params, lookup)
    : entriesAnswer(kind, params, lookup);
}

/** The program of `source`, parsed with the shared parser; no document is added (C5). */
function parseProgram(source: string): Program {
  return getOrCreateServices().Eligian.parser.LangiumParser.parse<Program>(source).value;
}

function lookupOf(program: Program, overlays: Lookup['overlays']): Lookup {
  const hostSignatures = hostOperations(program).flatMap(declaration => {
    const signature = getOperationSignature(declaration.name, program);
    return signature && !isRegistryOperation(declaration.name) ? [signature] : [];
  });
  return { program, hostSignatures, overlays };
}

export const handle = (
  params: OperationsParameters,
  context: ToolContext
): Effect.Effect<OperationsSuccess, ToolError, CompilerLock> => {
  const input = params.path;
  if (input === undefined) {
    return loadKnowledge(context.docsRoot).pipe(
      Effect.map(knowledge => ({
        header: header(context, undefined),
        ...answer(params, { program: undefined, hostSignatures: [], overlays: knowledge.overlays }),
      }))
    );
  }
  return Effect.gen(function* () {
    const root = yield* projectRoot(context.ai, context.cwd);
    const file = yield* resolveInputPath(root, input);
    const source = yield* Effect.tryPromise({
      try: () => fs.readFile(file, 'utf8'),
      catch: toToolError('read', file),
    });
    const knowledge = yield* loadKnowledge(context.docsRoot);
    const lock = yield* CompilerLock;
    const result = yield* lock.run(
      context.requestId,
      Effect.sync(() => answer(params, lookupOf(parseProgram(source), knowledge.overlays)))
    );
    return { header: header(context, file), ...result };
  });
};
