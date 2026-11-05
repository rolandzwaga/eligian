/**
 * The Eligian docs generator (spec 058 phase 1, FR-032, FR-035, FR-036, FR-038;
 * plan "Generator", "Literate probes"). Writes the docs the MCP server serves and
 * the CLI package ships:
 *
 * - `index.json`: every chunk's frontmatter plus its body word count, sorted by id;
 * - `overlays.json`: the diagnostic overlays of `curriculum/diagnostics/*.md`;
 * - `agents-block.md`: the AGENTS.md block `eligian_init` writes;
 * - `curriculum/*.md`: the hand-written chunks, with the compiled JSON of every
 *   literate probe of a `map-*` chunk spliced in after it;
 * - `generated/*.md`: the chunks built from the registry, the grammar, the
 *   starters, the Eligius schema and the diagnostic code registry.
 *
 * Deterministic: sorted iteration, `\n` line endings, no timestamps. The output
 * directory is deleted first, so no stale chunk survives a dev build.
 *
 * Run with tsx: `tsx scripts/generate-knowledge.ts --out dist/docs`.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileWithMap,
  DIAGNOSTIC_CODES,
  formatErrors,
  getAllOperations,
  getOperationsByCategory,
  type IEngineConfiguration,
  isConstantValueArray,
  type OperationSignature,
  STARTERS,
  starterFiles,
} from '@eligian/language';
import {
  CONTROLLERS,
  getOrCreateServices,
  SELF_RESOLVED,
  TIMELINE_EVENTS,
} from '@eligian/language/mcp';
import { Effect } from 'effect';
import { metadata as eligiusMetadata } from 'eligius/metadata';
import { REVIEW_CODES } from '../src/check/review.js';
import { sourceOf } from '../src/mcp/diagnostics.js';
import { agentsMdBlock } from '../src/mcp/instructions.js';
import { ELIGIUS_LINT_RULES } from '../src/mcp/knowledge/lint-rules.js';
import {
  CONTROLLER_STATUS,
  controllerCard,
  eventLine,
  eventName,
  operationCard,
} from '../src/mcp/knowledge/render.js';
import type { ChunkKind, IndexEntry, Overlay } from '../src/mcp/knowledge/types.js';

export interface GenerateOptions {
  readonly outDir: string;
  /** The hand-written chunks; default `src/mcp/knowledge/curriculum` */
  readonly curriculumDir?: string;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CURRICULUM = path.join(HERE, '..', 'src', 'mcp', 'knowledge', 'curriculum');
/** What the literate probes may import (`./probe.css`, `./probe-layout.html`) */
const PROBE_ASSETS = path.join(DEFAULT_CURRICULUM, 'probe-assets');

const CHUNK_KINDS: readonly ChunkKind[] = [
  'orientation',
  'mapping',
  'runtime',
  'workflow',
  'reference',
  'operation',
  'starter',
];

interface Chunk {
  readonly id: string;
  readonly title: string;
  readonly kind: ChunkKind;
  readonly use_cases: readonly string[];
  readonly see: readonly string[];
  readonly card: string;
  /** Without the trailing `see:` line, which `writeChunk` adds unless it is there */
  readonly body: string;
  /** Relative to the output directory, POSIX separators */
  readonly file: string;
}

// ---------------------------------------------------------------------------
// Text helpers

/** Code-unit order: the same on every machine and locale. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const normalize = (text: string): string => text.replace(/\r\n?/g, '\n');

const wordCount = (text: string): number => text.split(/\s+/).filter(word => word !== '').length;

/** A fenced block whose fence is longer than any backtick run in `content`. */
function fence(content: string, language: string): string {
  const longest = Math.max(2, ...(content.match(/`+/g) ?? []).map(run => run.length));
  const marks = '`'.repeat(longest + 1);
  return `${marks}${language}\n${content.replace(/\n+$/, '')}\n${marks}`;
}

const code = (text: string): string => `\`${text}\``;

const typeName = (type: string): string => type.replace(/^ParameterType:/, '');

const seeLine = (see: readonly string[]): string => `see: ${see.join(', ')}`;

// ---------------------------------------------------------------------------
// Frontmatter: written as YAML with JSON-quoted strings; read with the subset
// the curriculum uses (bare / quoted scalars, block and flow lists).

function frontmatter(chunk: Chunk): string {
  const list = (key: string, values: readonly string[]): string =>
    values.length === 0
      ? `${key}: []`
      : [`${key}:`, ...values.map(value => `  - ${JSON.stringify(value)}`)].join('\n');
  return [
    '---',
    `id: ${chunk.id}`,
    `title: ${JSON.stringify(chunk.title)}`,
    `kind: ${chunk.kind}`,
    list('use_cases', chunk.use_cases),
    list('see', chunk.see),
    `card: ${JSON.stringify(chunk.card)}`,
    '---',
  ].join('\n');
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

function scalar(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) return JSON.parse(value) as string;
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

/** The frontmatter fields and the body of a hand-written markdown file. */
function parseMarkdown(file: string): {
  readonly fields: Readonly<Record<string, string | readonly string[]>>;
  readonly body: string;
} {
  const text = normalize(fs.readFileSync(file, 'utf8'));
  const match = FRONTMATTER.exec(text);
  if (match === null) throw new Error(`${file}: no frontmatter`);
  const fields: Record<string, string | string[]> = {};
  let list: string[] | undefined;
  for (const line of match[1].split('\n')) {
    if (line.trim() === '') continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item !== null && list !== undefined) {
      list.push(scalar(item[1]));
      continue;
    }
    const field = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (field === null) throw new Error(`${file}: unsupported frontmatter line: ${line}`);
    const [, key, rest] = field;
    list = undefined;
    if (rest.trim() === '') {
      list = [];
      fields[key] = list;
    } else if (rest.trim().startsWith('[')) {
      const inner = rest
        .trim()
        .replace(/^\[|\]$/g, '')
        .trim();
      fields[key] = inner === '' ? [] : inner.split(',').map(scalar);
    } else {
      fields[key] = scalar(rest);
    }
  }
  return { fields, body: text.slice(match[0].length) };
}

function stringField(
  file: string,
  fields: Readonly<Record<string, string | readonly string[]>>,
  key: string
): string {
  const value = fields[key];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${file}: frontmatter field '${key}' must be a non-empty string`);
  }
  return value;
}

function listField(
  file: string,
  fields: Readonly<Record<string, string | readonly string[]>>,
  key: string
): readonly string[] {
  const value = fields[key];
  if (!Array.isArray(value)) throw new Error(`${file}: frontmatter field '${key}' must be a list`);
  return value;
}

// ---------------------------------------------------------------------------
// Literate probes (FR-038)

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** `value` with every `id` key removed, at any depth: ids are random per compile. */
function withoutIds(value: unknown): Json {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, nested]) => key !== 'id' && nested !== undefined)
        .map(([key, nested]) => [key, withoutIds(nested)])
    );
  }
  return value as Json;
}

/** The part of a compiled configuration a probe shows, keyed by action name / timeline uri. */
function probeFragment(config: IEngineConfiguration): Json {
  const actions = Object.fromEntries(
    config.actions.map(action => [
      action.name,
      withoutIds({ startOperations: action.startOperations, endOperations: action.endOperations }),
    ])
  );
  const timelines = Object.fromEntries(
    config.timelines.map(timeline => [
      timeline.uri,
      withoutIds({
        type: timeline.type,
        duration: timeline.duration,
        timelineActions: timeline.timelineActions.map(action => ({
          ...(action.name ? { name: action.name } : {}),
          duration: action.duration,
          startOperations: action.startOperations,
          endOperations: action.endOperations,
        })),
      }),
    ])
  );
  const initActions = config.initActions ?? [];
  return {
    actions,
    timelines,
    ...(initActions.length > 0 ? { initActions: withoutIds(initActions) } : {}),
  };
}

async function compileProbe(chunkId: string, index: number, source: string): Promise<string> {
  const sourceUri = path.join(PROBE_ASSETS, `probe-${chunkId}-${index}.eligian`);
  try {
    const { config } = await Effect.runPromise(compileWithMap(source, { sourceUri }));
    return JSON.stringify(probeFragment(config), null, 2);
  } catch (error) {
    const [formatted] =
      typeof error === 'object' && error !== null && '_tag' in error
        ? formatErrors([error as Parameters<typeof formatErrors>[0][number]], source)
        : [];
    const reason = formatted ? formatted.message : String(error);
    throw new Error(`${chunkId}: probe ${index} does not compile: ${reason}`);
  }
}

const PROBE_OPEN = /^```eligian probe\s*$/;
const FENCE_CLOSE = /^```\s*$/;

/** The body with the compiled JSON spliced in after every probe. */
async function spliceProbes(chunkId: string, body: string): Promise<string> {
  const lines = body.split('\n');
  const out: string[] = [];
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (!PROBE_OPEN.test(lines[i])) continue;
    const start = i + 1;
    let end = start;
    while (end < lines.length && !FENCE_CLOSE.test(lines[end])) end++;
    if (end === lines.length) throw new Error(`${chunkId}: probe ${index + 1} is not closed`);
    out.push(...lines.slice(start, end + 1));
    i = end;
    index++;
    const json = await compileProbe(chunkId, index, `${lines.slice(start, end).join('\n')}\n`);
    out.push('', fence(json, 'json compiled'));
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Curriculum and overlays

async function curriculumChunks(curriculumDir: string): Promise<Chunk[]> {
  if (!fs.existsSync(curriculumDir)) return [];
  const files = fs
    .readdirSync(curriculumDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort(byText);
  const chunks: Chunk[] = [];
  for (const name of files) {
    const file = path.join(curriculumDir, name);
    const { fields, body } = parseMarkdown(file);
    if (body.includes('```json compiled')) {
      throw new Error(`${file}: hand-written compiled JSON; the generator splices it in`);
    }
    const id = stringField(file, fields, 'id');
    const kind = stringField(file, fields, 'kind') as ChunkKind;
    if (!CHUNK_KINDS.includes(kind)) throw new Error(`${file}: unknown kind '${kind}'`);
    chunks.push({
      id,
      title: stringField(file, fields, 'title'),
      kind,
      use_cases: listField(file, fields, 'use_cases'),
      see: listField(file, fields, 'see'),
      card: stringField(file, fields, 'card'),
      body: id.startsWith('map-') ? await spliceProbes(id, body) : body,
      file: `curriculum/${id}.md`,
    });
  }
  return chunks;
}

interface OverlayFile {
  readonly name: string;
  readonly text: string;
  readonly code?: string;
  readonly source?: string;
  readonly fix: string;
}

function overlayFiles(curriculumDir: string): OverlayFile[] {
  const dir = path.join(curriculumDir, 'diagnostics');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.md'))
    .sort(byText)
    .map(name => {
      const file = path.join(dir, name);
      const { fields, body } = parseMarkdown(file);
      const code = typeof fields.code === 'string' ? fields.code : undefined;
      const source = typeof fields.source === 'string' ? fields.source : undefined;
      if ((code === undefined) === (source === undefined)) {
        throw new Error(`${file}: an overlay has either a 'code' or a 'source'`);
      }
      return {
        name,
        text: normalize(fs.readFileSync(file, 'utf8')),
        ...(code === undefined ? {} : { code }),
        ...(source === undefined ? {} : { source }),
        fix: body.trim(),
      };
    });
}

function overlaysOf(files: readonly OverlayFile[]): {
  byCode: Record<string, Overlay>;
  bySource: Record<string, Overlay>;
} {
  const byCode: Record<string, Overlay> = {};
  const bySource: Record<string, Overlay> = {};
  for (const overlay of files) {
    if (overlay.code !== undefined) {
      byCode[overlay.code] = { docs: `diagnostic/${overlay.code}`, fix: overlay.fix };
    } else if (overlay.source !== undefined) {
      bySource[overlay.source] = { docs: `diagnostic/source-${overlay.source}`, fix: overlay.fix };
    }
  }
  return { byCode, bySource };
}

// ---------------------------------------------------------------------------
// Generated chunks

const operationsSorted = (): OperationSignature[] =>
  [...getAllOperations()].sort((a, b) => byText(a.systemName, b.systemName));

function argumentTypes(signature: OperationSignature): string {
  if (signature.parameters.length === 0) return 'no arguments';
  return signature.parameters
    .map(parameter => {
      const types = parameter.type;
      const type = isConstantValueArray(types)
        ? types.map(constant => `'${constant.value}'`).join('|')
        : types.map(typeName).join('|');
      return `${parameter.name}${parameter.required ? '' : '?'}: ${type}`;
    })
    .join(', ');
}

const namesOf = (items: readonly { readonly name: string }[]): string =>
  items.length === 0 ? 'none' : items.map(item => item.name).join(', ');

/**
 * Fields of a `SELF_RESOLVED` `'*'` operation (data the compiler never rewrites)
 * in which Eligius still passes a chain on as text (lint W150; checked by
 * `dataflow-tables.spec.ts`).
 */
const NOT_RESOLVED_IN_WHOLE_DATA: Readonly<Record<string, readonly string[]>> = {
  setOperationData: ['override'],
};

/** The parameters in which the operation resolves property chains (`SELF_RESOLVED`). */
function resolvedFields(signature: OperationSignature): readonly string[] {
  const resolved = SELF_RESOLVED[signature.systemName];
  if (resolved === undefined) return [];
  const names = signature.parameters.map(parameter => parameter.name);
  if (resolved !== '*') return names.filter(name => resolved.has(name));
  const excluded = NOT_RESOLVED_IN_WHOLE_DATA[signature.systemName] ?? [];
  return names.filter(name => !excluded.includes(name));
}

/** False for Eligian sugar such as `addController`: no Eligius metadata, so no lint W150. */
const isEligiusOperation = (systemName: string): boolean =>
  Object.keys(eligiusMetadata).includes(systemName);

function callForm(signature: OperationSignature): string {
  const args = signature.parameters.map(p => `${p.name}${p.required ? '' : '?'}`);
  return `${signature.systemName}(${args.join(', ')})`;
}

function operationsIndexChunk(): Chunk {
  const byCategory = getOperationsByCategory();
  const sections = Object.keys(byCategory)
    .sort(byText)
    .map(category => {
      const lines = [...byCategory[category]]
        .sort((a, b) => byText(a.systemName, b.systemName))
        .map(signature => {
          const erased = [
            ...signature.parameters.filter(parameter => parameter.erased),
            ...signature.outputs.filter(output => output.erased),
          ];
          const resolved = resolvedFields(signature);
          return [
            `- ${code(callForm(signature))}`,
            argumentTypes(signature),
            `NEEDS ${namesOf(signature.dependencies)}`,
            `PROVIDES ${namesOf(signature.outputs)}`,
            `ERASES ${namesOf(erased)}`,
            `resolves chains in ${resolved.length === 0 ? 'none' : resolved.join(', ')}`,
          ].join(' · ');
        });
      return [`## ${category}`, '', ...lines].join('\n');
    });
  return {
    id: 'operations-index',
    title: 'Operations index',
    kind: 'reference',
    use_cases: ['find an operation', 'operation arguments', 'what an operation needs'],
    see: ['dataflow-tables', 'syntax-cheatsheet'],
    card: 'Every Eligius operation, one line each, by category: the call form, the argument types, NEEDS (what must be in the operation data before it), PROVIDES, ERASES, and the fields in which it resolves $operationdata chains. eligian_operations gives the full card.',
    body: [
      'Every built-in operation, one line each: the Eligian call form, the argument types (`?` = optional),',
      'NEEDS (operation data a previous operation must provide), PROVIDES (what it adds), ERASES',
      '(what is removed after it runs) and the fields in which it resolves property chains.',
      'Call an operation exactly like an action: `addClass("visible")`.',
      '',
      ...sections.join('\n\n').split('\n'),
    ].join('\n'),
    file: 'generated/operations-index.md',
  };
}

function operationChunk(signature: OperationSignature): Chunk {
  const card = operationCard(signature);
  const summary = card
    .split('\n')
    .filter(line => /^(NEEDS|PROVIDES|ERASES|RESOLVES CHAINS IN|CALL):/.test(line))
    .join('\n');
  return {
    id: `operation/${signature.systemName}`,
    title: signature.systemName,
    kind: 'operation',
    use_cases: signature.category ? [signature.category.toLowerCase()] : [],
    see: ['operations-index', 'dataflow-tables'],
    card: summary,
    body: card,
    file: `generated/operations/${signature.systemName}.md`,
  };
}

function dataflowChunk(): Chunk {
  const operations = operationsSorted();
  const rows = operations.flatMap(signature => {
    const resolved = new Set(resolvedFields(signature));
    const claim = (name: string): string => {
      if (!isEligiusOperation(signature.systemName)) return 'not an Eligius operation';
      return resolved.has(name) ? 'resolved' : 'not resolved';
    };
    return signature.parameters.map(
      parameter =>
        `| ${code(signature.systemName)} | ${code(parameter.name)} | ${claim(parameter.name)} |`
    );
  });
  const erased = operations
    .map(signature => ({
      name: signature.systemName,
      parameters: signature.parameters.filter(p => p.erased).map(p => p.name),
      outputs: signature.outputs.filter(o => o.erased).map(o => o.name),
    }))
    .filter(entry => entry.parameters.length + entry.outputs.length > 0)
    .map(entry => {
      const parts = [];
      if (entry.parameters.length > 0) parts.push(`parameters ${entry.parameters.join(', ')}`);
      if (entry.outputs.length > 0) parts.push(`outputs ${entry.outputs.join(', ')}`);
      return `- ${code(entry.name)}: ${parts.join('; ')}`;
    });
  const persistent = operations
    .map(signature => ({
      name: signature.systemName,
      outputs: signature.outputs.filter(o => !o.erased).map(o => o.name),
    }))
    .filter(entry => entry.outputs.length > 0)
    .map(entry => `- ${code(entry.name)}: ${entry.outputs.join(', ')}`);
  return {
    id: 'dataflow-tables',
    title: 'Dataflow tables',
    kind: 'reference',
    use_cases: ['property chains', '$operationdata', 'erased parameters', 'persistent outputs'],
    see: ['operations-index'],
    card: 'Which operation fields resolve $operationdata / $globaldata / $scope property chains (elsewhere a chain is passed on as text, Eligius lint W150), which parameters and outputs are erased after an operation runs, and which outputs persist in the operation data.',
    body: [
      '## Chain resolution',
      '',
      'A `$operationdata.`, `$globaldata.` or `$scope.` property chain is resolved only in the fields',
      'marked `resolved`. In a field marked `not resolved` the operation receives the chain as text',
      '(Eligius lint W150): resolve it first with `setOperationData`, or pass a literal value.',
      'A row marked `not an Eligius operation` is Eligian sugar that compiles to other operations',
      '(see its card); Eligius lint does not check it.',
      '',
      '| operation | field | chains |',
      '| --- | --- | --- |',
      ...rows,
      '',
      '## Erased parameters',
      '',
      'Removed from the operation data after the operation runs: a later operation in the same',
      'block does not see them.',
      '',
      ...erased,
      '',
      '## Persistent outputs',
      '',
      'Stay in the operation data for the rest of the block, until an operation replaces or erases them.',
      '',
      ...persistent,
    ].join('\n'),
    file: 'generated/dataflow-tables.md',
  };
}

function controllersChunk(): Chunk {
  const controllers = [...CONTROLLERS].sort((a, b) => byText(a.name, b.name));
  const statuses = Object.keys(CONTROLLER_STATUS)
    .sort(byText)
    .map(name => `- ${code(name)}: ${CONTROLLER_STATUS[name]}`);
  return {
    id: 'controllers',
    title: 'Controllers',
    kind: 'reference',
    use_cases: ['add a controller', 'addController', 'controller parameters'],
    see: ['operations-index', 'events'],
    card: `The ${controllers.length} Eligius controllers: what each needs, its parameters and the addController call. RoutingController is do-not-use; LottieController is constrained.`,
    body: [
      'A controller is attached with `addController("<Name>", …)` after a `selectElement`, and removed',
      'with `removeControllerFromElement("<Name>")`.',
      '',
      'Status:',
      '',
      ...statuses,
      '',
      ...controllers.flatMap(controller => [
        `## ${controller.name}`,
        '',
        fence(controllerCard(controller), 'text'),
        '',
      ]),
    ].join('\n'),
    file: 'generated/controllers.md',
  };
}

function eventsChunk(): Chunk {
  const events = [...TIMELINE_EVENTS].sort((a, b) => byText(eventName(a), eventName(b)));
  return {
    id: 'events',
    title: 'Timeline events',
    kind: 'reference',
    use_cases: ['event action', 'on event', 'broadcastEvent', 'eventArgs'],
    see: ['controllers', 'syntax-cheatsheet'],
    card: `The ${events.length} Eligius events an event action can listen to, with their category and the eventArgs each carries, typed as Eligian parameter annotations.`,
    body: [
      'One line per event: name · category · arguments (`?` = optional). An event action receives',
      'the arguments as its parameters: `on event "<name>" action handler(<args>) [ … ]`.',
      '',
      ...events.map(event => `- ${eventLine(event)}`),
    ].join('\n'),
    file: 'generated/events.md',
  };
}

// The grammar, read through the language services (a `loadGrammarFromJson` result)

interface GrammarNode {
  readonly $type: string;
  readonly [key: string]: unknown;
}

const isGrammarNode = (value: unknown): value is GrammarNode =>
  typeof value === 'object' && value !== null && typeof (value as GrammarNode).$type === 'string';

const refName = (reference: unknown): string => {
  const ref = reference as {
    readonly ref?: { readonly name?: string };
    readonly $refText?: string;
  };
  return ref.ref?.name ?? ref.$refText ?? '?';
};

/** An EBNF-like rendering of a grammar element. */
function renderElement(node: unknown, nested: boolean): string {
  if (!isGrammarNode(node)) return '';
  const cardinality = typeof node.cardinality === 'string' ? node.cardinality : '';
  const elements = Array.isArray(node.elements) ? node.elements : [];
  const wrap = (text: string, needsParens: boolean): string =>
    text === '' ? '' : needsParens || cardinality !== '' ? `(${text})${cardinality}` : text;
  switch (node.$type) {
    case 'Keyword':
      return `'${node.value as string}'${cardinality}`;
    case 'RuleCall':
      return `${refName(node.rule)}${cardinality}`;
    case 'Assignment':
      return `${node.feature as string}${node.operator as string}${renderElement(node.terminal, true)}${cardinality}`;
    case 'CrossReference': {
      const terminal = node.terminal === undefined ? '' : `:${renderElement(node.terminal, true)}`;
      return `[${refName(node.type)}${terminal}]${cardinality}`;
    }
    case 'Group':
      return wrap(
        elements
          .map(element => renderElement(element, true))
          .filter(text => text !== '')
          .join(' '),
        false
      );
    case 'Alternatives':
      return wrap(elements.map(element => renderElement(element, false)).join(' | '), nested);
    case 'UnorderedGroup':
      return wrap(elements.map(element => renderElement(element, true)).join(' & '), nested);
    default:
      return '';
  }
}

/** Every keyword value in a rule, in order of first appearance. */
function keywordsIn(node: unknown, into: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const element of node) keywordsIn(element, into);
  } else if (isGrammarNode(node)) {
    if (node.$type === 'Keyword' && !into.includes(node.value as string)) {
      into.push(node.value as string);
    }
    for (const [key, value] of Object.entries(node)) {
      if (!key.startsWith('$') && key !== 'rule' && key !== 'type') keywordsIn(value, into);
    }
  }
  return into;
}

function syntaxCheatsheetChunk(): Chunk {
  const grammar = getOrCreateServices().Eligian.Grammar as unknown as {
    readonly rules: readonly GrammarNode[];
  };
  const parserRules = grammar.rules.filter(rule => rule.$type === 'ParserRule');
  const terminals = grammar.rules.filter(rule => rule.$type === 'TerminalRule');
  const isWord = (keyword: string): boolean => /^[a-z][a-zA-Z]*$/.test(keyword);
  const keywords = [...new Set(parserRules.flatMap(rule => keywordsIn(rule.definition)))]
    .filter(isWord)
    .sort(byText);
  const actionName = parserRules.find(rule => rule.name === 'ActionName');
  const contextual = actionName ? keywordsIn(actionName.definition).filter(isWord) : [];
  const ruleLines = parserRules.map(rule => {
    const entry = rule.entry === true ? 'entry ' : '';
    return `${entry}${rule.name as string}: ${renderElement(rule.definition, false)}`;
  });
  const terminalLines = terminals.map(rule => {
    const hidden = rule.hidden === true ? 'hidden ' : '';
    const regex = isGrammarNode(rule.definition) ? (rule.definition.regex as string) : '';
    return `${hidden}${rule.name as string}: ${regex}`;
  });
  return {
    id: 'syntax-cheatsheet',
    title: 'Syntax cheatsheet',
    kind: 'reference',
    use_cases: ['eligian syntax', 'keywords', 'grammar', 'is this valid eligian'],
    see: ['operations-index', 'events'],
    card: 'Every Eligian keyword and every grammar rule, generated from the grammar itself. If a construct is not here, Eligian does not have it.',
    body: [
      'Generated from the Eligian grammar. If a construct is not here, Eligian does not have it.',
      '',
      '## Keywords',
      '',
      keywords.map(code).join(', '),
      '',
      '## Contextual keywords',
      '',
      'Keywords that may also be used as an action, operation, controller or function name',
      '(the `ActionName` rule):',
      '',
      contextual.map(code).join(', '),
      '',
      '## Rules',
      '',
      "One line per grammar rule: `'kw'` is a keyword, `x=R` assigns, `x+=R` adds to a list,",
      '`x?=R` is a flag, `[T:R]` is a reference to a `T` written as `R`; `?`, `*`, `+` as usual.',
      '',
      fence(ruleLines.join('\n'), 'text'),
      '',
      '## Terminals',
      '',
      fence(terminalLines.join('\n'), 'text'),
    ].join('\n'),
    file: 'generated/syntax-cheatsheet.md',
  };
}

const LANGUAGES: Readonly<Record<string, string>> = {
  '.eligian': 'eligian',
  '.html': 'html',
  '.css': 'css',
  '.json': 'json',
  '.md': 'markdown',
  '.ts': 'ts',
  '.js': 'js',
};

function starterChunks(): Chunk[] {
  return [...STARTERS]
    .sort((a, b) => byText(a.name, b.name))
    .map(starter => {
      const files = starterFiles(starter.name);
      const sections = Object.keys(files)
        .sort(byText)
        .flatMap(name => [
          `## ${name}`,
          '',
          fence(normalize(files[name]), LANGUAGES[path.extname(name)] ?? 'text'),
          '',
        ]);
      return {
        id: `starter/${starter.name}`,
        title: `Starter: ${starter.label}`,
        kind: 'starter' as const,
        use_cases: ['new presentation', 'eligian init', starter.name],
        see: ['project-layout', 'syntax-cheatsheet'],
        card: [starter.description, ...starter.notes].join('. '),
        body: [
          `The files \`eligian init --template ${starter.name}\` writes, verbatim (title "My Presentation").`,
          '',
          ...sections,
        ].join('\n'),
        file: `generated/starters/${starter.name}.md`,
      };
    });
}

interface SchemaProperty {
  readonly type?: string;
  readonly $ref?: string;
  readonly description?: string;
  readonly items?: SchemaProperty;
}

function schemaType(property: SchemaProperty): string {
  if (property.$ref) return property.$ref.replace(/^#\/definitions\//, '');
  if (property.type === 'array' && property.items) return `${schemaType(property.items)}[]`;
  return property.type ?? 'unknown';
}

function configShapeChunk(): Chunk {
  const eligiusRoot = path.dirname(createRequire(import.meta.url).resolve('eligius/package.json'));
  const schema = JSON.parse(
    fs.readFileSync(path.join(eligiusRoot, 'jsonschema', 'eligius-configuration.json'), 'utf8')
  ) as {
    readonly properties: Readonly<Record<string, SchemaProperty>>;
    readonly required?: readonly string[];
  };
  const required = new Set(schema.required ?? []);
  const properties = Object.keys(schema.properties)
    .sort(byText)
    .map(name => {
      const property = schema.properties[name];
      const description = property.description ? `. ${property.description}` : '';
      return `- ${code(name)} (${required.has(name) ? 'required' : 'optional'}): ${schemaType(property)}${description}`;
    });
  return {
    id: 'config-shape',
    title: 'Eligius configuration shape',
    kind: 'reference',
    use_cases: ['compiled json', 'eligius configuration', 'what the compiler emits'],
    see: ['operations-index', 'diagnostics'],
    card: 'The top-level properties of the Eligius configuration JSON that Eligian compiles to, the values Eligian fills in itself, and the rule: trust eligius/lint (eligian_check runs it), not the schema.',
    body: [
      'Eligian compiles a program to one Eligius configuration (JSON). Never write or patch that JSON',
      'by hand: change the .eligian source and compile again.',
      '',
      '## Top-level properties',
      '',
      'From the installed `eligius/jsonschema/eligius-configuration.json`:',
      '',
      ...properties,
      '',
      '## What Eligian fills in',
      '',
      '- `engine` is `{ systemName: "EligiusEngine" }` and `containerSelector` is `#eligius-container`.',
      '- `language` is `en-US` with one English entry in `availableLanguages`, unless the program has a',
      '  `languages` block: then its entries, the default marked with `*` when there are several.',
      '- `layoutTemplate` is the HTML of the `layout` import; `cssFiles` the `styles` imports; `locales`',
      '  the `locales` import.',
      '- `timelineProviderSettings` has one entry per timeline type used: `animation` (RafPositionSource)',
      '  for `raf`, `scroll` and `custom`; `mediaplayer` (VideoPositionSource) for `video` and `audio`.',
      '- The compiled JSON also carries `$schema`.',
      '- `timelineFlow` is never emitted.',
      '- Every `id` (the configuration, actions, operations, languages) is a random UUID, new on every',
      '  compile: never reference one, and compare compiled output with the ids left out.',
      '',
      '## Trust eligius/lint, not the schema',
      '',
      'The schema accepts configurations the engine rejects at runtime. `eligian check` and',
      '`eligian_check` run Eligius lint (`eligius/lint`) over the compiled configuration and report its',
      'findings at their source as `eligius-<rule>` diagnostics: those are the authority.',
    ].join('\n'),
    file: 'generated/config-shape.md',
  };
}

function diagnosticsChunk(overlays: ReturnType<typeof overlaysOf>): Chunk {
  const codes = [
    ...new Set([
      ...DIAGNOSTIC_CODES.map(entry => entry.code),
      ...REVIEW_CODES,
      'compile-failed',
      ...ELIGIUS_LINT_RULES.map(rule => `eligius-${rule}`),
    ]),
  ].sort(byText);
  const lines = codes.map(diagnostic => {
    const source = sourceOf(diagnostic);
    const overlay = overlays.byCode[diagnostic]?.docs ?? overlays.bySource[source]?.docs ?? '-';
    return `- ${diagnostic} · ${source} · ${overlay}`;
  });
  return {
    id: 'diagnostics',
    title: 'Diagnostic codes',
    kind: 'reference',
    use_cases: ['diagnostic code', 'error code', 'warning code', 'fix a diagnostic'],
    see: ['config-shape', 'operations-index'],
    card: 'Every diagnostic code eligian_check can report, with the stage that reports it and the id of its overlay (cause + fix). eligian_check inlines the overlay text in the diagnostic.',
    body: [
      'One line per code: `code · source · overlay id`. The source is the stage that reports it',
      '(`parser`, `validator`, `type`, `linker`, `compiler`, `eligius-lint`, `review`). The overlay',
      "holds the cause and the fix; `eligian_check` puts its text in the diagnostic's `fix` field.",
      '`-` means the code has no overlay yet.',
      '',
      ...lines,
    ].join('\n'),
    file: 'generated/diagnostics.md',
  };
}

// ---------------------------------------------------------------------------

function writeFile(outDir: string, file: string, text: string): void {
  const target = path.join(outDir, ...file.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

/** The chunk file: frontmatter, then the body ending with its `see:` line. */
function chunkText(chunk: Chunk): { readonly text: string; readonly body: string } {
  const trimmed = chunk.body.trim();
  const see = seeLine(chunk.see);
  const lines = trimmed.split('\n');
  const body = `\n${lines[lines.length - 1] === see ? trimmed : `${trimmed}\n\n${see}`}\n`;
  return { text: `${frontmatter(chunk)}\n${body}`, body };
}

/** Writes the docs into `outDir` (deleted first); returns the files written, sorted. */
export async function generateKnowledge(
  options: GenerateOptions
): Promise<{ readonly files: readonly string[] }> {
  const outDir = path.resolve(options.outDir);
  const curriculumDir = path.resolve(options.curriculumDir ?? DEFAULT_CURRICULUM);

  // Build everything before touching outDir: a broken probe leaves the old docs.
  const overlays = overlayFiles(curriculumDir);
  const overlayMap = overlaysOf(overlays);
  const chunks: Chunk[] = [
    ...(await curriculumChunks(curriculumDir)),
    operationsIndexChunk(),
    ...operationsSorted().map(operationChunk),
    dataflowChunk(),
    controllersChunk(),
    eventsChunk(),
    syntaxCheatsheetChunk(),
    ...starterChunks(),
    configShapeChunk(),
    diagnosticsChunk(overlayMap),
  ].sort((a, b) => byText(a.id, b.id));

  const ids = new Set<string>();
  for (const chunk of chunks) {
    if (ids.has(chunk.id)) throw new Error(`duplicate chunk id '${chunk.id}'`);
    ids.add(chunk.id);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  const files: string[] = [];
  const write = (file: string, text: string): void => {
    writeFile(outDir, file, text);
    files.push(file);
  };

  const index: IndexEntry[] = [];
  for (const chunk of chunks) {
    const { text, body } = chunkText(chunk);
    write(chunk.file, text);
    index.push({
      id: chunk.id,
      title: chunk.title,
      kind: chunk.kind,
      use_cases: chunk.use_cases,
      words: wordCount(body),
      see: chunk.see,
      card: chunk.card,
    });
  }
  for (const overlay of overlays) write(`curriculum/diagnostics/${overlay.name}`, overlay.text);
  write('index.json', `${JSON.stringify(index, null, 2)}\n`);
  write('overlays.json', `${JSON.stringify(overlayMap, null, 2)}\n`);
  write('agents-block.md', agentsMdBlock());

  return { files: files.sort(byText) };
}

// ---------------------------------------------------------------------------
// Command line: tsx scripts/generate-knowledge.ts --out <dir>

const isMain = (): boolean => {
  const script = process.argv[1];
  if (script === undefined) return false;
  const self = fileURLToPath(import.meta.url);
  const same = (a: string, b: string): boolean =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  return same(path.resolve(script), self) || same(path.resolve(script), self.replace(/\.ts$/, ''));
};

if (isMain()) {
  const at = process.argv.indexOf('--out');
  const out = at === -1 ? undefined : process.argv[at + 1];
  if (out === undefined) {
    process.stderr.write('usage: tsx scripts/generate-knowledge.ts --out <dir>\n');
    process.exitCode = 2;
  } else {
    generateKnowledge({ outDir: out }).then(
      ({ files }) => {
        process.stdout.write(`generate-knowledge: ${files.length} files in ${path.resolve(out)}\n`);
      },
      (error: unknown) => {
        process.stderr.write(
          `generate-knowledge: ${error instanceof Error ? error.message : String(error)}\n`
        );
        process.exitCode = 1;
      }
    );
  }
}
