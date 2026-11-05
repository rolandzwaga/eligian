/**
 * Spec 058 Phase 1 (FR-032, FR-035, FR-036, FR-038–FR-042, FR-055; plan
 * "Generator", "Literate probes", "Curriculum source rules", "Overlay selection",
 * "Drift test"): the generated docs name everything the language and Eligius
 * define, the generator is deterministic, the literate probes of the `map-*`
 * chunks splice the real compiled JSON, the runtime chunks teach only probed
 * claims, and the codes without an overlay are exactly the allowlist.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkFiles,
  compileWithMap,
  DIAGNOSTIC_CODES,
  getAllOperations,
  getCompilerVersion,
  OPERATION_ORIGINS,
  STARTERS,
  starterFiles,
} from '@eligian/language';
import { LINT_RULES_CHECKED_BY_ELIGIAN } from '@eligian/language/eligius-lint';
import {
  CONTROLLERS,
  DOM_EVENTS,
  getOrCreateServices,
  HTML_ELEMENT_NAMES,
  KEY_COMPLETIONS,
  TIMELINE_EVENTS,
} from '@eligian/language/mcp';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import {
  type DiagnosticCodeRanking,
  RANKING_FILE,
  rankDiagnosticCodes,
  SELECTION_SIZE,
} from '../../scripts/rank-diagnostic-codes.js';
import {
  OPERATION_RANKING_FILE,
  OPERATION_SELECTION_SIZE,
  type OperationRanking,
  rankOperations,
} from '../../scripts/rank-operations.js';
import { REVIEW_CODES } from '../check/review.js';
import { sourceOf } from '../mcp/diagnostics.js';
import { ELIGIUS_LINT_RULES } from '../mcp/knowledge/lint-rules.js';
import { eventName } from '../mcp/knowledge/render.js';
import type { IndexEntry, Overlays } from '../mcp/knowledge/types.js';
import { ORIGIN_RULES } from '../mcp/origin-rules.js';
import type { EffectAi } from '../mcp/paths.js';
import { handle as docsHandle } from '../mcp/tools/docs.js';
import { SMOKE_CODES } from '../smoke/smoke-runner.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE_FIXTURES = path.join(HERE, '__fixtures__', 'mcp', 'curriculum-probe');
const CURRICULUM = path.join(HERE, '..', 'mcp', 'knowledge', 'curriculum');
const PROBE_ASSETS = path.join(CURRICULUM, 'probe-assets');
const OVERLAYS_DIR = path.join(CURRICULUM, 'diagnostics');
const MISSING_OVERLAYS = path.join(HERE, '__fixtures__', 'mcp', 'missing-overlays.json');
const RUNTIME_CLAIMS_SPEC = path.join(HERE, 'mcp-runtime-claims.spec.ts');
const EXECUTION_MODEL = fileURLToPath(
  new URL('../../../../examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md', import.meta.url)
);
const TOUR = path.dirname(EXECUTION_MODEL);
const ELIGIUS_ROOT = path.dirname(createRequire(import.meta.url).resolve('eligius/package.json'));

const tempDirs: string[] = [];
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-docs-'));
  tempDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

let generated: Promise<string> | undefined;
/** One generator run into a temp dir, shared by the describes that read the docs. */
const generatedDocs = (): Promise<string> => {
  generated ??= (async () => {
    const dir = tempDir();
    await generateKnowledge({ outDir: dir });
    return dir;
  })();
  return generated;
};

/** A file's text with `\n` line endings (a Windows checkout may have CRLF). */
const readText = (file: string): string => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

/** Every file under `dir`, as sorted POSIX paths relative to it. */
const listFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
    )
    .sort();

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

/** The frontmatter `id` of a chunk file and its body. */
const chunkOf = (text: string): { readonly id?: string; readonly body: string } => {
  const match = FRONTMATTER.exec(text);
  if (match === null) return { body: text };
  const id = /^id: (.+)$/m.exec(match[1])?.[1];
  return { ...(id === undefined ? {} : { id }), body: text.slice(match[0].length) };
};

const wordCount = (text: string): number => text.split(/\s+/).filter(word => word !== '').length;

interface GrammarNode {
  readonly $type: string;
  readonly [key: string]: unknown;
}

const isNode = (value: unknown): value is GrammarNode =>
  typeof value === 'object' && value !== null && typeof (value as GrammarNode).$type === 'string';

/** The values of every `Keyword` reachable from the grammar's entry rule. */
function reachableKeywords(grammar: unknown): Set<string> {
  const rules = (grammar as { readonly rules: readonly GrammarNode[] }).rules;
  const entry = rules.find(rule => rule.$type === 'ParserRule' && rule.entry === true);
  if (entry === undefined) throw new Error('the grammar has no entry rule');
  const keywords = new Set<string>();
  const visited = new Set<GrammarNode>();
  const visitRule = (rule: GrammarNode): void => {
    if (visited.has(rule)) return;
    visited.add(rule);
    visit(rule.definition);
  };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const element of node) visit(element);
      return;
    }
    if (!isNode(node)) return;
    if (node.$type === 'Keyword') keywords.add(node.value as string);
    if (node.$type === 'RuleCall') {
      const called = (node.rule as { readonly ref?: GrammarNode }).ref;
      if (called?.$type === 'ParserRule') visitRule(called);
    }
    for (const [key, value] of Object.entries(node)) {
      if (!key.startsWith('$') && key !== 'rule' && key !== 'type') visit(value);
    }
  };
  visitRule(entry);
  return keywords;
}

describe('generated docs', () => {
  let outDir: string;
  let secondDir: string;
  let index: IndexEntry[];
  let overlays: Overlays;
  const read = (file: string): string => fs.readFileSync(path.join(outDir, file), 'utf8');

  beforeAll(async () => {
    outDir = await generatedDocs();
    secondDir = tempDir();
    await generateKnowledge({ outDir: secondDir });
    index = JSON.parse(read('index.json'));
    overlays = JSON.parse(read('overlays.json'));
  }, 120_000);

  /** The chunk files by their frontmatter id. */
  const chunkFiles = (): Map<string, string> => {
    const files = new Map<string, string>();
    for (const file of listFiles(outDir).filter(name => name.endsWith('.md'))) {
      const { id } = chunkOf(read(file));
      if (id !== undefined) files.set(id, file);
    }
    return files;
  };

  it('names every registry operation', () => {
    const operationsIndex = read('generated/operations-index.md');
    for (const { systemName } of getAllOperations()) {
      expect(fs.existsSync(path.join(outDir, 'generated', 'operations', `${systemName}.md`))).toBe(
        true
      );
      expect(operationsIndex).toContain(`\`${systemName}(`);
    }
  });

  it('names the 9 controllers', () => {
    expect(CONTROLLERS).toHaveLength(9);
    const controllers = read('generated/controllers.md');
    for (const { name } of CONTROLLERS) {
      expect(controllers).toMatch(new RegExp(`^## ${name}$`, 'm'));
    }
  });

  it('names the 46 timeline events', () => {
    const names = TIMELINE_EVENTS.map(eventName);
    expect(new Set(names).size).toBe(46);
    const events = read('generated/events.md');
    for (const name of names) expect(events).toContain(`- ${name} · `);
  });

  it('names every grammar keyword', () => {
    const keywords = [...reachableKeywords(getOrCreateServices().Eligian.Grammar)].filter(keyword =>
      /^[a-z][a-zA-Z]*$/.test(keyword)
    );
    // Contextual keywords of ActionName are among them
    expect(keywords).toEqual(expect.arrayContaining(['play', 'toggle', 'controller', 'timeline']));
    const cheatsheet = read('generated/syntax-cheatsheet.md');
    for (const keyword of keywords) expect(cheatsheet).toContain(`\`${keyword}\``);
  });

  it('names the 4 starters', () => {
    expect(STARTERS).toHaveLength(4);
    const ids = new Set(index.map(entry => entry.id));
    for (const { name } of STARTERS) {
      expect(fs.existsSync(path.join(outDir, 'generated', 'starters', `${name}.md`))).toBe(true);
      expect(ids.has(`starter/${name}`)).toBe(true);
    }
  });

  it('names every top-level config property', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(ELIGIUS_ROOT, 'jsonschema', 'eligius-configuration.json'), 'utf8')
    ) as { readonly properties: Record<string, unknown> };
    const configShape = read('generated/config-shape.md');
    const properties = Object.keys(schema.properties);
    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) expect(configShape).toContain(`\`${property}\``);
  });

  it('two runs are byte-identical', () => {
    const files = listFiles(outDir);
    expect(listFiles(secondDir)).toEqual(files);
    for (const file of files) {
      expect(
        fs
          .readFileSync(path.join(secondDir, file))
          .equals(fs.readFileSync(path.join(outDir, file))),
        file
      ).toBe(true);
    }
  });

  it('a stale file is removed', async () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'generated', 'stale.md'), 'stale\n');
    await generateKnowledge({ outDir: dir });
    expect(fs.existsSync(path.join(dir, 'generated', 'stale.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'index.json'))).toBe(true);
  }, 120_000);

  it('cards ≤ 120 words; generated chunks ≤ 6000 words', () => {
    const files = chunkFiles();
    expect(index.length).toBeGreaterThan(0);
    for (const entry of index) {
      expect(wordCount(entry.card), entry.id).toBeLessThanOrEqual(120);
      if (files.get(entry.id)?.startsWith('generated/')) {
        expect(entry.words, entry.id).toBeLessThanOrEqual(6000);
      }
    }
    for (const id of ['diagnostics', 'operations-index']) {
      expect(files.get(id)).toBe(`generated/${id}.md`);
    }
  });

  it('every chunk ends with its see line', () => {
    const files = chunkFiles();
    for (const entry of index) {
      const file = files.get(entry.id);
      expect(file, entry.id).toBeDefined();
      expect(entry.see.length, entry.id).toBeGreaterThan(0);
      const lines = read(file as string)
        .trimEnd()
        .split('\n');
      expect(lines[lines.length - 1], entry.id).toBe(`see: ${entry.see.join(', ')}`);
    }
  });

  it('index.json is sorted by id with words counted', () => {
    const ids = index.map(entry => entry.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    const files = chunkFiles();
    expect([...files.keys()].sort()).toEqual(ids);
    for (const entry of index) {
      expect(entry.words, entry.id).toBe(
        wordCount(chunkOf(read(files.get(entry.id) as string)).body)
      );
    }
  });

  it('diagnostics.md has one code · source · overlay id line per code and no overlay text', () => {
    const expected = [
      ...DIAGNOSTIC_CODES.map(entry => entry.code),
      ...REVIEW_CODES,
      ...SMOKE_CODES,
      'compile-failed',
      ...ELIGIUS_LINT_RULES.map(rule => `eligius-${rule}`),
    ];
    const diagnostics = read('generated/diagnostics.md');
    const lines = diagnostics
      .split('\n')
      .map(line => /^- (\S+) · (\S+) · (\S+)$/.exec(line))
      .filter(match => match !== null);
    expect(lines.map(match => match[1]).sort()).toEqual([...new Set(expected)].sort());
    for (const [, code, source, overlay] of lines) {
      expect(source, code).toBe(sourceOf(code));
      expect(overlay, code).toBe(
        overlays.byCode[code]?.docs ?? overlays.bySource[source]?.docs ?? '-'
      );
    }
    for (const overlay of [
      ...Object.values(overlays.byCode),
      ...Object.values(overlays.bySource),
    ]) {
      expect(diagnostics).not.toContain(overlay.fix);
    }
  });

  it('the curated lint rules are lint.mjs literals minus W111', () => {
    const lint = fs.readFileSync(path.join(ELIGIUS_ROOT, 'dist', 'lint.mjs'), 'utf8');
    const literals = [...new Set((lint.match(/"[EW]\d{3}"/g) ?? []).map(l => l.slice(1, -1)))];
    const curated = literals.filter(rule => !LINT_RULES_CHECKED_BY_ELIGIAN.includes(rule)).sort();
    expect(LINT_RULES_CHECKED_BY_ELIGIAN).toEqual(['W111']);
    expect([...ELIGIUS_LINT_RULES].sort()).toEqual(curated);
  });

  it('using custom compiles silently as animation', async () => {
    const source = `styles "./probe.css"
layout "./probe-layout.html"

timeline "main" in "#stage" using custom {
  at 0s..1s [
    log("custom")
  ]
}
`;
    const dir = tempDir();
    for (const asset of ['probe.css', 'probe-layout.html']) {
      fs.copyFileSync(path.join(PROBE_ASSETS, asset), path.join(dir, asset));
    }
    const file = path.join(dir, 'custom.eligian');
    fs.writeFileSync(file, source);

    const { config } = await Effect.runPromise(compileWithMap(source, { sourceUri: file }));
    expect(config.timelines.map(timeline => timeline.type)).toEqual(['animation']);

    const [result] = await Effect.runPromise(checkFiles([file]));
    expect(result.diagnostics).toEqual([]);
  });

  // Phase 3 FR-057 / SC-014: the chunks generated from the language data
  const bodyOf = (id: string): string => chunkOf(read(`generated/${id}.md`)).body;
  const listLines = (id: string): string[] =>
    bodyOf(id)
      .split('\n')
      .filter(line => line.startsWith('- '));

  it('generated/dom-events.md names every DOM_EVENTS key', () => {
    const lines = listLines('dom-events');
    expect(lines).toHaveLength(DOM_EVENTS.size);
    for (const [event, description] of DOM_EVENTS) {
      expect(lines, event).toContain(`- \`on ${event} "<sel>" …\`: ${description}`);
    }
  });

  it('generated/key-names.md names every KEY_COMPLETIONS key', () => {
    const lines = listLines('key-names');
    expect(lines).toHaveLength(KEY_COMPLETIONS.size);
    for (const [key, description] of KEY_COMPLETIONS) {
      expect(lines, key).toContain(`- \`on key "${key}" …\`: ${description}`);
    }
  });

  it('generated/html-elements.md names every HTML_ELEMENT_NAMES entry', () => {
    const lines = listLines('html-elements');
    expect(lines).toHaveLength(HTML_ELEMENT_NAMES.length);
    HTML_ELEMENT_NAMES.forEach((tag, at) => {
      expect(lines[at]?.startsWith(`- \`${tag}\``), tag).toBe(true);
    });
    // Names only, no enum values; the common attributes are listed once, not per element
    expect(bodyOf('html-elements')).not.toContain('enum');
    expect(lines.join('\n')).not.toContain('aria-label');
  });

  const FR_057_CHUNKS: Record<string, readonly string[]> = {
    'dom-events': ['map-events-and-interactions'],
    'key-names': ['map-events-and-interactions', 'map-controllers'],
    'html-elements': ['layout-html'],
  };

  it('each has an index entry of kind reference and a see: line', () => {
    for (const [id, see] of Object.entries(FR_057_CHUNKS)) {
      const entry = index.find(candidate => candidate.id === id);
      expect(entry, id).toMatchObject({ kind: 'reference', see });
      const lines = read(`generated/${id}.md`).trimEnd().split('\n');
      expect(lines[lines.length - 1], id).toBe(`see: ${see.join(', ')}`);
    }
  });

  it('each chunk stays within the Phase 1 FR-035 word limits', () => {
    for (const id of Object.keys(FR_057_CHUNKS)) {
      const entry = index.find(candidate => candidate.id === id);
      expect(entry, id).toBeDefined();
      expect(wordCount(entry?.card ?? ''), id).toBeLessThanOrEqual(120);
      // FR-035 caps a generated chunk at 6,000 words; plan G holds these three to 1,500
      expect(entry?.words, id).toBeLessThanOrEqual(1500);
    }
  });
});

describe('literate probes', () => {
  const PROBE_OPEN = '```eligian probe';
  const COMPILED_OPEN = '```json compiled';

  /** Every key of every object nested in `value`. */
  const keysOf = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(keysOf);
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, nested]) => [key, ...keysOf(nested)]);
  };

  it('splices the compiled fragment', async () => {
    const outDir = tempDir();
    await generateKnowledge({ outDir, curriculumDir: PROBE_FIXTURES });
    const lines = fs
      .readFileSync(path.join(outDir, 'curriculum', 'map-test.md'), 'utf8')
      .split('\n');

    const probe = lines.indexOf(PROBE_OPEN);
    expect(probe).toBeGreaterThan(0);
    const probeEnd = lines.indexOf('```', probe + 1);
    const compiled = lines.findIndex((line, i) => i > probeEnd && line.trim() !== '');
    expect(lines[compiled]).toBe(COMPILED_OPEN);
    const compiledEnd = lines.indexOf('```', compiled + 1);
    const fragment = `${lines.slice(compiled + 1, compiledEnd).join('\n')}\n`;

    const parsed = JSON.parse(fragment) as {
      readonly actions: Record<string, unknown>;
      readonly timelines: Record<string, unknown>;
    };
    expect(Object.keys(parsed.actions)).toEqual(['highlight']);
    expect(Object.keys(parsed.timelines)).toHaveLength(1);
    expect(keysOf(parsed)).not.toContain('id');
    await expect(fragment).toMatchFileSnapshot('./__snapshots__/probes/map-test-1.json.snap');

    // The source chunk itself carries no hand-written JSON
    const source = fs.readFileSync(path.join(PROBE_FIXTURES, 'map-test.md'), 'utf8');
    expect(source).not.toContain(COMPILED_OPEN);
  }, 120_000);

  it('a broken probe fails with chunk id and index', async () => {
    const outDir = tempDir();
    const run = generateKnowledge({ outDir, curriculumDir: path.join(PROBE_FIXTURES, 'broken') });
    await expect(run).rejects.toThrow(/map-broken/);
    await expect(run).rejects.toThrow(/probe 1/);
    await expect(run).rejects.toThrow(/noSuchOperation/);
  }, 120_000);
});

/** The hand-written chunks of FR-039 (Phase 1) and FR-070 (Phase 2) and their kinds. */
const FR_039_CHUNKS: Record<string, IndexEntry['kind']> = {
  'what-is-eligius': 'orientation',
  'what-is-eligian': 'orientation',
  'project-layout': 'orientation',
  'not-eligian': 'orientation',
  decisions: 'orientation',
  'map-dataflow': 'mapping',
  'map-actions-and-calls': 'mapping',
  'map-timeline-and-providers': 'mapping',
  'map-events-and-interactions': 'mapping',
  'map-controllers': 'mapping',
  'runtime-engine-lifecycle': 'runtime',
  'runtime-scheduling': 'runtime',
  // FR-070 C: the remaining runtime chunks
  'timing-models': 'runtime',
  'runtime-quirks': 'runtime',
  'runtime-state-pitfalls': 'runtime',
  storyboard: 'workflow',
  // FR-070 B: the remaining mapping chunks
  'map-program-and-config': 'mapping',
  'map-erased-parameters': 'mapping',
  'map-control-flow-and-data': 'mapping',
  'map-event-actions': 'mapping',
  'map-imports-and-assets': 'mapping',
  'map-locales-and-languages': 'mapping',
  // FR-070 D: the workflow chunks
  'layout-html': 'workflow',
  'css-conventions': 'workflow',
  'provider-choice': 'workflow',
  'presentation-patterns': 'workflow',
  'assets-and-host-modules': 'workflow',
  'host-modules-contract': 'workflow',
  'verification-ladder': 'workflow',
};

/** SC-013(1): the 16 chunks FR-070 adds (B: 6 mapping, C: 3 runtime, D: 7 workflow). */
const FR_070_CHUNKS = [
  'map-program-and-config',
  'map-erased-parameters',
  'map-control-flow-and-data',
  'map-event-actions',
  'map-imports-and-assets',
  'map-locales-and-languages',
  'timing-models',
  'runtime-quirks',
  'runtime-state-pitfalls',
  'layout-html',
  'css-conventions',
  'provider-choice',
  'presentation-patterns',
  'assets-and-host-modules',
  'host-modules-contract',
  'verification-ladder',
] as const;

/** The generated `reference` chunks (`generated/<id>.md`). */
const REFERENCE_CHUNKS = [
  'config-shape',
  'controllers',
  'dataflow-tables',
  'diagnostics',
  'dom-events',
  'events',
  'html-elements',
  'key-names',
  'operations-index',
  'syntax-cheatsheet',
] as const;

/** An FR-075 example marker line. */
const EXAMPLE_OPEN = /^\s*\/\/\s*@mcp-example\s/;

/** The marker lines of one text. */
const markersIn = (text: string): number =>
  text.split(/\r?\n/).filter(line => EXAMPLE_OPEN.test(line)).length;

/** The markers the tour's `.eligian` files carry. */
const tourMarkers = (): number =>
  fs
    .readdirSync(TOUR)
    .filter(file => file.endsWith('.eligian'))
    .reduce((sum, file) => sum + markersIn(fs.readFileSync(path.join(TOUR, file), 'utf8')), 0);

/** The markers the starters carry: every `starterFiles` `.eligian` text. */
const starterMarkers = (): number =>
  STARTERS.flatMap(({ name }) =>
    Object.entries(starterFiles(name))
      .filter(([file]) => file.endsWith('.eligian'))
      .map(([, text]) => markersIn(text))
  ).reduce((sum, count) => sum + count, 0);

/** SC-014: the chunks whose every teaching unit cites a probed runtime claim. */
const RUNTIME_CHUNKS = [
  'runtime-engine-lifecycle',
  'runtime-scheduling',
  'timing-models',
  'runtime-quirks',
  'runtime-state-pitfalls',
] as const;

/** The hand-written curriculum chunks: file name → source text, by file name. */
const curriculumSources = (): Map<string, string> =>
  new Map(
    fs
      .readdirSync(CURRICULUM, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => entry.name)
      .sort()
      .map(name => [name, readText(path.join(CURRICULUM, name))] as const)
  );

/** The `CLAIMS` string literals of `mcp-runtime-claims.spec.ts`, read as text (not exported). */
function runtimeClaims(): string[] {
  const text = readText(RUNTIME_CLAIMS_SPEC);
  const block = /const CLAIMS = \[([\s\S]*?)\] as const;/.exec(text);
  if (block === null) throw new Error('mcp-runtime-claims.spec.ts has no CLAIMS array');
  return [...block[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map(match =>
    (match[1] ?? match[2]).replace(/\\(.)/g, '$1')
  );
}

/**
 * The paragraphs and list items of a body that teach something: everything
 * outside headings, fenced code, `Compiler:` paragraphs and the `see:` line.
 */
function teachingUnits(body: string): string[] {
  const units: string[] = [];
  let current: string[] = [];
  let fenceMarks: string | undefined;
  const flush = (): void => {
    if (current.length > 0) units.push(current.join(' '));
    current = [];
  };
  for (const line of body.split('\n')) {
    const fenceLine = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMarks !== undefined) {
      if (fenceLine?.[1].startsWith(fenceMarks)) fenceMarks = undefined;
      continue;
    }
    if (fenceLine !== null) {
      flush();
      fenceMarks = fenceLine[1];
      continue;
    }
    if (line.trim() === '' || /^#{1,6}\s/.test(line) || line.startsWith('see: ')) {
      flush();
      continue;
    }
    if (/^\s*(?:[-*+]|\d+\.)\s/.test(line)) flush();
    current.push(line.trim());
  }
  flush();
  return units.filter(unit => !unit.startsWith('Compiler:'));
}

const MARKER = /\(probed: "([^"]*)"\)/g;

describe('curriculum', () => {
  it('ships the FR-039 chunks', async () => {
    const index: IndexEntry[] = JSON.parse(
      fs.readFileSync(path.join(await generatedDocs(), 'index.json'), 'utf8')
    );
    const kinds = new Map(index.map(entry => [entry.id, entry.kind]));
    for (const [id, kind] of Object.entries(FR_039_CHUNKS)) expect(kinds.get(id), id).toBe(kind);

    const counts: Record<string, number> = {};
    for (const kind of Object.values(FR_039_CHUNKS)) counts[kind] = (counts[kind] ?? 0) + 1;
    expect(counts).toEqual({ orientation: 5, mapping: 11, runtime: 5, workflow: 8 });

    // The whole index: the curriculum kinds plus the generated ones; one example per marker
    const indexCounts: Record<string, number> = {};
    for (const entry of index) indexCounts[entry.kind] = (indexCounts[entry.kind] ?? 0) + 1;
    expect(indexCounts).toEqual({
      ...counts,
      reference: REFERENCE_CHUNKS.length,
      starter: STARTERS.length,
      operation: getAllOperations().length,
      example: tourMarkers() + starterMarkers(),
    });
    expect(
      index
        .filter(entry => entry.kind === 'reference')
        .map(entry => entry.id)
        .sort()
    ).toEqual([...REFERENCE_CHUNKS].sort());

    // The curriculum is exactly these chunks: no hand-written chunk outside the list
    const ids = [...curriculumSources().values()].map(text => chunkOf(text).id);
    expect(ids.sort()).toEqual(Object.keys(FR_039_CHUNKS).sort());
  }, 120_000);

  it('runtime chunks teach only probed claims', () => {
    const claims = runtimeClaims();
    expect(claims.length).toBeGreaterThan(0);
    const model = readText(EXECUTION_MODEL);
    // SC-014: an explicit list, since a `runtime-` prefix filter would miss `timing-models`
    const sources = curriculumSources();
    const runtime = RUNTIME_CHUNKS.map(id => [`${id}.md`, sources.get(`${id}.md`)] as const);
    expect(runtime.filter(([, text]) => text === undefined).map(([name]) => name)).toEqual([]);
    // Every `kind: runtime` chunk is in the list
    expect(
      Object.entries(FR_039_CHUNKS)
        .filter(([, kind]) => kind === 'runtime')
        .map(([id]) => id)
        .sort()
    ).toEqual([...RUNTIME_CHUNKS].sort());

    for (const [name, text = ''] of runtime) {
      const { id, body } = chunkOf(text);
      expect(`${id}.md`).toBe(name);
      // (c) no sentence the model doc marks as not probed
      expect(text, name).not.toContain('not probed');
      // (a) every teaching paragraph and list item cites a probe
      const units = teachingUnits(body);
      expect(units.length, name).toBeGreaterThan(0);
      for (const unit of units) {
        expect([...unit.matchAll(MARKER)].length, `${name}: ${unit}`).toBeGreaterThan(0);
      }
      // (b) every cited title is a CLAIMS title the model doc carries as a marker
      const titles = [...body.matchAll(MARKER)].map(match => match[1]);
      for (const title of titles) {
        expect(claims, `${name}: ${title}`).toContain(title);
        expect(model, `${name}: ${title}`).toContain(`(probed: "${title}")`);
      }
    }
  });

  it('curriculum bodies are 300–1500 words', () => {
    const sources = curriculumSources();
    expect(sources.size).toBe(Object.keys(FR_039_CHUNKS).length);
    for (const [name, text] of sources) {
      const words = wordCount(chunkOf(text).body);
      expect(words, name).toBeGreaterThanOrEqual(300);
      expect(words, name).toBeLessThanOrEqual(1500);
    }
  });
});

describe('probes', () => {
  /** The `json compiled` fragments spliced into a generated chunk, in order. */
  const compiledFragments = (text: string): string[] => {
    const lines = text.split('\n');
    const fragments: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const open = /^(`{3,})json compiled$/.exec(lines[i]);
      if (open === null) continue;
      const end = lines.indexOf(open[1], i + 1);
      expect(end, `unclosed compiled block at line ${i + 1}`).toBeGreaterThan(i);
      fragments.push(`${lines.slice(i + 1, end).join('\n')}\n`);
      i = end;
    }
    return fragments;
  };

  // SC-013(2): the probes of the map-* chunks and of presentation-patterns
  it('every map-* and presentation-patterns probe matches its snapshot', async () => {
    const outDir = await generatedDocs();
    const mapChunks = Object.keys(FR_039_CHUNKS)
      .filter(id => id.startsWith('map-') || id === 'presentation-patterns')
      .sort();
    expect(mapChunks).toHaveLength(12);
    for (const chunk of mapChunks) {
      const source = readText(path.join(CURRICULUM, `${chunk}.md`));
      const probes = source.split('\n').filter(line => /^```eligian probe\s*$/.test(line)).length;
      expect(probes, chunk).toBeGreaterThanOrEqual(1);

      const fragments = compiledFragments(
        fs.readFileSync(path.join(outDir, 'curriculum', `${chunk}.md`), 'utf8')
      );
      expect(fragments, chunk).toHaveLength(probes);
      for (const [i, fragment] of fragments.entries()) {
        await expect(fragment).toMatchFileSnapshot(
          `./__snapshots__/probes/${chunk}-${i + 1}.json.snap`
        );
      }
    }
  }, 120_000);
});

describe('overlays', () => {
  /** The overlay files of `curriculum/diagnostics/`: frontmatter `code` → file name. */
  const codeOverlays = (): Map<string, string> => {
    const overlays = new Map<string, string>();
    for (const name of fs.readdirSync(OVERLAYS_DIR).filter(file => file.endsWith('.md'))) {
      const frontmatter = FRONTMATTER.exec(readText(path.join(OVERLAYS_DIR, name)))?.[1] ?? '';
      const code = /^code: "?([^"\n]+)"?$/m.exec(frontmatter)?.[1];
      if (code !== undefined) overlays.set(code, name);
    }
    return overlays;
  };

  /** The FR-036 catalogue plus the review and smoke codes (Phase 3 FR-056). */
  const catalogue = (): string[] =>
    [
      ...new Set([
        ...DIAGNOSTIC_CODES.map(entry => entry.code),
        ...REVIEW_CODES,
        ...SMOKE_CODES,
        'compile-failed',
        ...ELIGIUS_LINT_RULES.map(rule => `eligius-${rule}`),
      ]),
    ].sort();

  const allowlist = (): string[] => JSON.parse(readText(MISSING_OVERLAYS));

  const committedRanking = (): DiagnosticCodeRanking => JSON.parse(readText(RANKING_FILE));

  // Phase 3 SC-005(2)(3) / FR-056: every code of the catalogue has its overlay file, and the
  // Phase 1 allowlist is empty
  it('no code lacks an overlay', () => {
    const overlays = codeOverlays();
    for (const [code, name] of overlays) expect(name, code).toBe(`${code}.md`);

    const missing = catalogue().filter(
      code =>
        overlays.get(code) !== `${code}.md` || !fs.existsSync(path.join(OVERLAYS_DIR, `${code}.md`))
    );
    expect(missing, 'codes without curriculum/diagnostics/<code>.md').toEqual([]);
    expect(allowlist(), 'missing-overlays.json').toEqual([]);
  });

  it('the review overlays exist and are not allowlisted', async () => {
    expect([...REVIEW_CODES].sort()).toEqual([
      'class-never-removed',
      'controller-imbalance',
      'entry-timeline-without-enter',
      'host-operation-in-block-without-select',
      'lottie-web-not-installed',
      'media-file-missing',
      'media-from-duplicate',
      'media-timeline-first-without-start-gesture',
      'timeline-container-not-in-layout',
    ]);
    const overlays = codeOverlays();
    const generatedOverlays: Overlays = JSON.parse(
      fs.readFileSync(path.join(await generatedDocs(), 'overlays.json'), 'utf8')
    );
    const listed = allowlist();
    for (const code of REVIEW_CODES) {
      expect(overlays.get(code), code).toBe(`${code}.md`);
      expect(generatedOverlays.byCode[code]?.docs, code).toBe(`diagnostic/${code}`);
      expect(listed, code).not.toContain(code);
    }
  }, 120_000);

  // SC-013(6) / FR-076: the codes Phase 2 adds (review, smoke, FR-055) have overlays
  it('new codes have overlays', async () => {
    const newCodes = [...REVIEW_CODES, ...SMOKE_CODES, 'unknown-listener-action'];
    expect(SMOKE_CODES.length).toBeGreaterThan(0);
    const overlays = codeOverlays();
    const generatedOverlays: Overlays = JSON.parse(
      fs.readFileSync(path.join(await generatedDocs(), 'overlays.json'), 'utf8')
    );
    const listed = allowlist();
    for (const code of newCodes) {
      expect(overlays.get(code), code).toBe(`${code}.md`);
      expect(generatedOverlays.byCode[code]?.docs, code).toBe(`diagnostic/${code}`);
      expect(listed, code).not.toContain(code);
      // T041: cause + fix in at most 120 words
      const body = chunkOf(readText(path.join(OVERLAYS_DIR, `${code}.md`))).body;
      expect(wordCount(body), code).toBeLessThanOrEqual(120);
    }
  }, 120_000);

  // T048 timed the ranking at ~2 s locally (baseline/ranking-time.txt), so it runs everywhere
  it('the ranking selection equals the script output', async () => {
    const ranking = await rankDiagnosticCodes();
    const committed = committedRanking();
    expect(ranking.selection).toHaveLength(SELECTION_SIZE);
    expect(committed.selection).toEqual(ranking.selection);
    expect(committed.caseCodes).toEqual(ranking.caseCodes);
  }, 300_000);

  // FR-073 / I-9, ruling 2026-11-05 (T036): the selection is every operation the examples
  // and starters call, at most 25 (13 today), not padded to 25
  it('the operation ranking equals a fresh run and every selected operation is counted', async () => {
    const ranking = await rankOperations();
    const committed: OperationRanking = JSON.parse(readText(OPERATION_RANKING_FILE));
    expect(committed).toEqual(ranking);
    expect(committed.selection.length).toBeGreaterThan(0);
    expect(committed.selection.length).toBeLessThanOrEqual(OPERATION_SELECTION_SIZE);
    expect(committed.selection).toEqual(
      committed.counts.slice(0, OPERATION_SELECTION_SIZE).map(({ name }) => name)
    );
  }, 300_000);

  it('the selection contains the case 13 and 14 start codes and has overlays', () => {
    const { caseCodes, selection } = committedRanking();
    // The union of the two start-state lists of eval-cases.spec.ts (T045)
    expect(caseCodes).toEqual([
      'erased-property-access',
      'import-duplicate-default',
      'missing-action-dependency',
      'selector_not_in_layout',
      'syntax-error',
    ]);
    expect(selection.slice(0, caseCodes.length)).toEqual(caseCodes);
    const overlays = codeOverlays();
    for (const code of selection) expect(overlays.get(code), code).toBe(`${code}.md`);
  });
});

describe('phase 2 generator', () => {
  /** A temp copy of the tour's `.eligian` files (the only tour files the generator reads). */
  const tourCopy = (): string => {
    const dir = tempDir();
    for (const name of fs.readdirSync(TOUR).filter(file => file.endsWith('.eligian'))) {
      fs.copyFileSync(path.join(TOUR, name), path.join(dir, name));
    }
    return dir;
  };

  /** Appends `lines` to `file`; returns the 1-based line number of the first appended line. */
  const append = (file: string, lines: readonly string[], eol = '\n'): number => {
    const text = fs.readFileSync(file, 'utf8');
    const base = text.endsWith('\n') ? text : `${text}${eol}`;
    fs.writeFileSync(file, `${base}${lines.join(eol)}${eol}`);
    return base.split(/\r?\n/).length;
  };

  it('generator fails on an unclosed marker', async () => {
    const tourDir = tourCopy();
    const line = append(path.join(tourDir, 'tour.eligian'), [
      '// @mcp-example left-open Left open',
    ]);
    const run = generateKnowledge({ outDir: tempDir(), curriculumDir: PROBE_FIXTURES, tourDir });
    await expect(run).rejects.toThrow(new RegExp(`tour\\.eligian:${line}\\b`));
    await expect(run).rejects.toThrow(/unclosed/);
    await expect(run).rejects.toThrow(/left-open/);
  }, 120_000);

  it('generator fails on a duplicate example id', async () => {
    const tourDir = tourCopy();
    const marker = ['// @mcp-example twice Twice', '// nothing', '// @mcp-end'];
    append(path.join(tourDir, 'presentation.eligian'), marker);
    const line = append(path.join(tourDir, 'tour.eligian'), marker);
    const run = generateKnowledge({ outDir: tempDir(), curriculumDir: PROBE_FIXTURES, tourDir });
    // Files are scanned in name order: the second occurrence is in tour.eligian
    await expect(run).rejects.toThrow(new RegExp(`tour\\.eligian:${line}\\b`));
    await expect(run).rejects.toThrow(/duplicate example id 'twice'/);
  }, 120_000);

  it('one example file per marker', async () => {
    const tourDir = tourCopy();
    append(path.join(tourDir, 'presentation.eligian'), [
      '  // @mcp-example first-pair The first pair',
      '  at 0s..1s [',
      '    log("one")',
      '  ]',
      '  // @mcp-end',
    ]);
    // CRLF is accepted
    append(
      path.join(tourDir, 'tour.eligian'),
      ['// @mcp-example second-pair The second pair', 'const beat = 7s', '// @mcp-end'],
      '\r\n'
    );
    const outDir = tempDir();
    await generateKnowledge({ outDir, curriculumDir: PROBE_FIXTURES, tourDir });

    const files = fs.readdirSync(path.join(outDir, 'generated', 'examples')).sort();
    // The two appended markers plus the tour's own (T044) and the starters'
    expect(files).toHaveLength(2 + tourMarkers() + starterMarkers());
    expect(files).toEqual(expect.arrayContaining(['first-pair.md', 'second-pair.md']));
    const index: IndexEntry[] = JSON.parse(
      fs.readFileSync(path.join(outDir, 'index.json'), 'utf8')
    );
    const examples = index.filter(entry => entry.kind === 'example');
    expect(examples.map(entry => entry.id).sort()).toEqual(
      files.map(file => `example/${file.replace(/\.md$/, '')}`).sort()
    );
    const first = examples.find(entry => entry.id === 'example/first-pair');
    expect(first?.title).toBe('The first pair');
    expect(first?.card).toBe('The first pair');

    const read = (name: string): string =>
      fs.readFileSync(path.join(outDir, 'generated', 'examples', name), 'utf8');
    const text = read('first-pair.md');
    expect(text).toContain('```eligian\nat 0s..1s [\n  log("one")\n]\n```');
    expect(text).toContain('examples/eligian-tour/presentation.eligian');
    expect(text).not.toContain('@mcp-');
    const second = read('second-pair.md');
    expect(second).toContain('```eligian\nconst beat = 7s\n```');
    expect(second).not.toContain('\r');
  }, 120_000);

  it('probes run in presentation-patterns and in operation/controller overlays', async () => {
    const curriculumDir = tempDir();
    const probe = (...operations: string[]): string =>
      [
        '```eligian probe',
        'styles "./probe.css"',
        'layout "./probe-layout.html"',
        '',
        'action ping [',
        '  log("ping")',
        ']',
        '',
        'timeline "main" in "#stage" using raf {',
        '  at 0s..1s [',
        ...operations.map(operation => `    ${operation}`),
        '  ]',
        '}',
        '```',
      ].join('\n');
    const chunk = (id: string, kind: string, text: string): string =>
      [
        '---',
        `id: ${id}`,
        `title: "${id}"`,
        `kind: ${kind}`,
        'use_cases:',
        '  - test',
        'see:',
        '  - operations-index',
        `card: The ${id} test chunk.`,
        '---',
        '',
        text,
        '',
        'see: operations-index',
        '',
      ].join('\n');
    const overlay = (fields: readonly string[], body: string): string =>
      ['---', ...fields, '---', '', body, ''].join('\n');
    fs.writeFileSync(
      path.join(curriculumDir, 'presentation-patterns.md'),
      chunk(
        'presentation-patterns',
        'workflow',
        probe('selectElement("#title")', 'addClass("visible")')
      )
    );
    // A chunk outside the filter: its probe block is left as it is
    fs.writeFileSync(
      path.join(curriculumDir, 'storyboard.md'),
      chunk('storyboard', 'workflow', probe('log("not compiled")'))
    );
    fs.mkdirSync(path.join(curriculumDir, 'operations'));
    fs.writeFileSync(
      path.join(curriculumDir, 'operations', 'addClass.md'),
      overlay(
        ['operation: addClass', 'card: Adds a class to the selected element; select it first.'],
        `Operation overlay body.\n\n${probe('selectElement("#box")', 'addClass("active")')}`
      )
    );
    fs.mkdirSync(path.join(curriculumDir, 'controllers'));
    fs.writeFileSync(
      path.join(curriculumDir, 'controllers', 'DOMEventListenerController.md'),
      overlay(
        [
          'controller: DOMEventListenerController',
          'status: recommended',
          'card: Runs actions on a DOM event of the selected element.',
        ],
        `Controller overlay body.\n\n${probe(
          'selectElement("#next")',
          'addController("DOMEventListenerController", "click", ["ping"])'
        )}`
      )
    );

    const outDir = tempDir();
    await generateKnowledge({ outDir, curriculumDir, tourDir: tempDir() });
    const read = (file: string): string => fs.readFileSync(path.join(outDir, file), 'utf8');
    const compiledBlocks = (text: string): number =>
      text.split('\n').filter(line => /^`{3,}json compiled$/.test(line)).length;

    expect(compiledBlocks(read('curriculum/presentation-patterns.md'))).toBe(1);
    expect(compiledBlocks(read('curriculum/storyboard.md'))).toBe(0);

    const operation = read('generated/operations/addClass.md');
    expect(operation).toContain('Operation overlay body.');
    expect(operation).toContain('Adds a class to the selected element; select it first.');
    expect(compiledBlocks(operation)).toBe(1);

    const controllers = read('generated/controllers.md');
    expect(controllers).toContain('Controller overlay body.');
    expect(controllers).toContain('STATUS: recommended');
    expect(controllers).toMatch(/^- `DOMEventListenerController`: recommended$/m);
    expect(compiledBlocks(controllers)).toBe(1);

    const overlays: Overlays = JSON.parse(read('overlays.json'));
    expect(overlays.operations).toEqual({
      addClass: { card: 'Adds a class to the selected element; select it first.' },
    });
    expect(overlays.controllers).toEqual({
      DOMEventListenerController: {
        status: 'recommended',
        card: 'Runs actions on a DOM event of the selected element.',
      },
    });

    // A broken overlay probe fails, naming the overlay
    fs.writeFileSync(
      path.join(curriculumDir, 'operations', 'removeClass.md'),
      overlay(['operation: removeClass', 'card: Removes a class.'], probe('noSuchOperation()'))
    );
    const broken = generateKnowledge({ outDir: tempDir(), curriculumDir, tourDir: tempDir() });
    await expect(broken).rejects.toThrow(/removeClass/);
    await expect(broken).rejects.toThrow(/noSuchOperation/);
  }, 120_000);

  it('the diagnostics catalogue lists SMOKE_CODES (smoke), the nine REVIEW_CODES (review) and unknown-listener-action', async () => {
    const diagnostics = fs.readFileSync(
      path.join(await generatedDocs(), 'generated', 'diagnostics.md'),
      'utf8'
    );
    const sources = new Map(
      diagnostics
        .split('\n')
        .map(line => /^- (\S+) · (\S+) · (\S+)$/.exec(line))
        .filter(match => match !== null)
        .map(match => [match[1], match[2]] as const)
    );
    expect(SMOKE_CODES.length).toBeGreaterThan(0);
    for (const code of SMOKE_CODES) expect(sources.get(code), code).toBe('smoke');
    expect(REVIEW_CODES).toHaveLength(9);
    for (const code of REVIEW_CODES) expect(sources.get(code), code).toBe('review');
    expect(sources.get('unknown-listener-action')).toBe('validator');
  }, 120_000);
});

describe('phase 2 knowledge', () => {
  let outDir: string;
  let index: IndexEntry[];
  let overlays: Overlays;
  const read = (file: string): string => readText(path.join(outDir, file));
  const entry = (id: string): IndexEntry | undefined => index.find(e => e.id === id);
  const fenceCount = (text: string, info: RegExp): number =>
    text.split('\n').filter(line => info.test(line)).length;
  const PROBE = /^`{3,}eligian probe\s*$/;
  const COMPILED = /^`{3,}json compiled$/;

  beforeAll(async () => {
    outDir = await generatedDocs();
    index = JSON.parse(read('index.json'));
    overlays = JSON.parse(read('overlays.json'));
  }, 120_000);

  // SC-013(1): the FR-035 chunk format
  it('the 16 chunks exist and meet the limits', () => {
    expect(FR_070_CHUNKS).toHaveLength(16);
    for (const id of FR_070_CHUNKS) {
      const file = path.join(CURRICULUM, `${id}.md`);
      expect(fs.existsSync(file), id).toBe(true);
      const text = readText(file);
      const frontmatter = FRONTMATTER.exec(text)?.[1] ?? '';
      for (const key of ['id', 'title', 'kind', 'use_cases', 'see', 'card']) {
        expect(frontmatter, `${id}: ${key}`).toMatch(new RegExp(`^${key}:`, 'm'));
      }
      expect(chunkOf(text).id).toBe(id);
      const listed = entry(id);
      expect(listed?.kind, id).toBe(FR_039_CHUNKS[id]);
      expect(wordCount(listed?.card ?? ''), id).toBeGreaterThan(0);
      expect(wordCount(listed?.card ?? ''), id).toBeLessThanOrEqual(120);
      const words = wordCount(chunkOf(text).body);
      expect(words, id).toBeGreaterThanOrEqual(300);
      expect(words, id).toBeLessThanOrEqual(1500);
      expect(listed?.see.length, id).toBeGreaterThan(0);
      // The generator appends the see line to the chunk it writes
      const generatedLines = read(`curriculum/${id}.md`).trimEnd().split('\n');
      const last = generatedLines[generatedLines.length - 1];
      expect(last, id).toBe(`see: ${listed?.see.join(', ')}`);
    }
  });

  // SC-013(4) / FR-074
  it('9 controller overlays: status, card ≤ 120 words, compiling probe', () => {
    expect(CONTROLLERS).toHaveLength(9);
    const dir = path.join(CURRICULUM, 'controllers');
    const names = CONTROLLERS.map(({ name }) => name).sort();
    expect(
      fs
        .readdirSync(dir)
        .filter(file => file.endsWith('.md'))
        .sort()
    ).toEqual(names.map(name => `${name}.md`));
    const controllerOverlays = overlays.controllers ?? {};
    expect(Object.keys(controllerOverlays).sort()).toEqual(names);

    const statuses: Record<string, string | undefined> = {};
    for (const name of names) {
      const text = readText(path.join(dir, `${name}.md`));
      const frontmatter = FRONTMATTER.exec(text)?.[1] ?? '';
      expect(frontmatter, name).toMatch(new RegExp(`^controller: ${name}$`, 'm'));
      const overlay = controllerOverlays[name];
      statuses[name] = overlay?.status;
      expect(wordCount(overlay?.card ?? ''), name).toBeGreaterThan(0);
      expect(wordCount(overlay?.card ?? ''), name).toBeLessThanOrEqual(120);
      // The probe calls the controller
      const body = chunkOf(text).body;
      expect(fenceCount(body, PROBE), name).toBeGreaterThanOrEqual(1);
      expect(body, name).toContain(`addController("${name}"`);
    }
    expect(statuses).toEqual({
      DOMEventListenerController: 'recommended',
      KeyboardController: 'recommended',
      LabelController: 'recommended',
      LottieController: 'constrained',
      MutationObserverController: 'recommended',
      NavigationController: 'recommended',
      ProgressbarController: 'recommended',
      RoutingController: 'do-not-use',
      SubtitlesController: 'recommended',
    });
    expect(readText(path.join(dir, 'LottieController.md'))).toContain('lottie-web');

    // The generator compiled every probe: each controller's section carries a compiled block
    const lines = read('generated/controllers.md').split('\n');
    const headings = names.map(name => lines.indexOf(`## ${name}`));
    for (const [i, name] of names.entries()) {
      expect(headings[i], name).toBeGreaterThan(-1);
      const end = Math.min(...headings.filter(start => start > headings[i]), lines.length);
      const section = lines.slice(headings[i], end).join('\n');
      expect(section, name).toContain(`STATUS: ${statuses[name]}`);
      expect(fenceCount(section, COMPILED), name).toBeGreaterThanOrEqual(1);
    }
  });

  // Phase 3 SC-005(1) / FR-055: an overlay for every registry operation. getAllOperations()
  // includes the synthetic `addController` (operations/index.ts), so the sets are equal (the
  // ruling of 2026-11-05 on plan P4, which counted registry.generated.ts only)
  it('every operation has an overlay', () => {
    const registry = getAllOperations().map(({ systemName }) => systemName);
    expect(registry).toContain('addController');
    const expected = [...new Set(registry)].sort();
    const dir = path.join(CURRICULUM, 'operations');
    const names = fs
      .readdirSync(dir)
      .filter(file => file.endsWith('.md'))
      .map(file => file.slice(0, -'.md'.length))
      .sort();
    expect(
      expected.filter(name => !names.includes(name)),
      'operations without curriculum/operations/<name>.md'
    ).toEqual([]);
    expect(names.filter(name => !registry.includes(name))).toEqual([]);
    expect(names).toEqual(expected);
    const operationOverlays = overlays.operations ?? {};
    expect(Object.keys(operationOverlays).sort()).toEqual(expected);

    for (const name of expected) {
      const text = readText(path.join(dir, `${name}.md`));
      expect(FRONTMATTER.exec(text)?.[1] ?? '', name).toMatch(
        new RegExp(`^operation: ${name}$`, 'm')
      );
      const card = operationOverlays[name]?.card ?? '';
      expect(wordCount(card), name).toBeGreaterThan(0);
      expect(wordCount(card), name).toBeLessThanOrEqual(120);
      expect(fenceCount(chunkOf(text).body, PROBE), name).toBeGreaterThanOrEqual(1);
      // Merged into the generated operation chunk, its probe compiled
      const merged = read(`generated/operations/${name}.md`);
      expect(merged, name).toContain(card);
      expect(fenceCount(merged, COMPILED), name).toBeGreaterThanOrEqual(1);
    }
  });

  // Phase 3 SC-005(4): every diagnostics overlay body and every operation card
  it('overlay bodies and cards ≤ 120 words', () => {
    const diagnostics = fs.readdirSync(OVERLAYS_DIR).filter(file => file.endsWith('.md'));
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const file of diagnostics) {
      const body = chunkOf(readText(path.join(OVERLAYS_DIR, file))).body;
      expect(wordCount(body), file).toBeGreaterThan(0);
      expect(wordCount(body), file).toBeLessThanOrEqual(120);
    }
    const cards = Object.entries(overlays.operations ?? {});
    expect(cards.length).toBeGreaterThan(0);
    for (const [name, { card }] of cards) {
      expect(wordCount(card), name).toBeGreaterThan(0);
      expect(wordCount(card), name).toBeLessThanOrEqual(120);
    }
  });

  // SC-013(7) / FR-077: the no-argument `eligian_docs` answer over the real generated docs
  it('index ≤ 12000 chars', async () => {
    const ai: EffectAi = await import('effect/ai');
    const payload = await Effect.runPromise(
      docsHandle(
        {},
        { ai, cwd: process.cwd(), docsRoot: outDir, versions: getCompilerVersion(), requestId: '1' }
      )
    );
    // FR-077 second ruling: the operations are not listed (eligian_operations has them)
    const listed = index.filter(item => item.kind !== 'operation');
    expect(payload.index?.map(item => item.id)).toEqual(listed.map(item => item.id));
    expect(payload.operations?.count).toBe(index.length - listed.length);
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(12000);
  });

  // SC-013(9) / FR-075: a drift check; no chunk is required to cite an example
  it('see: example ids exist', () => {
    const ids = new Set(index.map(item => item.id));
    expect([...ids].some(id => id.startsWith('example/'))).toBe(true);
    const cited = index.flatMap(item =>
      item.see.filter(id => id.startsWith('example/')).map(id => `${item.id} → ${id}`)
    );
    expect(cited.filter(line => !ids.has(line.slice(line.indexOf('→ ') + 2)))).toEqual([]);
  });
});

// Spec 058 Phase 3 (FR-046, SC-012(4)): the explain rule table against the origins and the docs
describe('origin rules', () => {
  const DIST_INDEX = path.join(HERE, '..', '..', 'dist', 'docs', 'index.json');

  it('ORIGIN_RULES covers OPERATION_ORIGINS; docs ids exist; rules ≤ 300 chars', () => {
    expect(Object.keys(ORIGIN_RULES).sort()).toEqual([...OPERATION_ORIGINS].sort());
    if (!fs.existsSync(DIST_INDEX)) {
      throw new Error(`${DIST_INDEX} is missing: run pnpm -C packages/cli build`);
    }
    const ids = new Set((JSON.parse(readText(DIST_INDEX)) as IndexEntry[]).map(entry => entry.id));
    for (const [origin, { rule, docs }] of Object.entries(ORIGIN_RULES)) {
      expect(ids.has(docs), `${origin}: ${docs}`).toBe(true);
      expect(rule.length, origin).toBeGreaterThan(0);
      expect(rule.length, origin).toBeLessThanOrEqual(300);
    }
  });
});

// Spec 058 Phase 3 (FR-052, SC-013 ladder part): determinism on the ladder, the clock's limits
describe('verification ladder', () => {
  const ladder = (): string => readText(path.join(CURRICULUM, 'verification-ladder.md'));

  it('verification-ladder names --determinism and determinism:true, and the clock’s three limits', () => {
    const text = ladder();
    expect(text).toContain('--determinism');
    expect(text).toContain('determinism:true');
    // The media clock's limits, one phrase each
    expect(text).toContain('positions only');
    expect(text).toContain('no decoding');
    expect(text).toContain('no autoplay policy');

    // The step sits after scenarios and before dev
    const headings = text.split('\n').filter(line => line.startsWith('## '));
    const at = (pattern: RegExp): number => headings.findIndex(line => pattern.test(line));
    const scenarios = at(/smoke with scenarios/);
    const determinism = at(/determinism/);
    const dev = at(/^## \d+\. dev\b/);
    expect(scenarios, headings.join(' | ')).toBeGreaterThanOrEqual(0);
    expect(determinism, headings.join(' | ')).toBe(scenarios + 1);
    expect(dev, headings.join(' | ')).toBe(determinism + 1);
  });
});

// Spec 058 Phase 3 (FR-065 D-L3, SC-017(2)): the Lottie limit is documented, not fixed
describe('Lottie D-L3', () => {
  const README = path.join(HERE, '..', '..', 'README.md');
  const OVERLAY = path.join(CURRICULUM, 'controllers', 'LottieController.md');
  /** The text with every run of whitespace as one space (the prose wraps anywhere). */
  const flat = (text: string): string => text.replace(/\s+/g, ' ');
  const D_L3_PHRASES = [
    "`lottie-web` fails at import under smoke's jsdom (no canvas)",
    'Eligius reports it as a missing peer dependency',
  ];

  it('the LottieController overlay and the README state D-L3', () => {
    const overlay = readText(OVERLAY);
    for (const [name, text] of [
      ['LottieController.md', overlay],
      ['README.md', readText(README)],
    ] as const) {
      for (const phrase of D_L3_PHRASES) expect(flat(text), name).toContain(phrase);
    }

    // The status stays constrained
    expect(FRONTMATTER.exec(overlay)?.[1] ?? '').toMatch(/^status: constrained$/m);

    // The probe loads the animation with loadJson("./anim.json") before attaching the controller
    const probe = /^`{3,}eligian probe\s*\n([\s\S]*?)\n`{3,}\s*$/m.exec(chunkOf(overlay).body)?.[1];
    expect(probe).toBeDefined();
    const load = probe?.indexOf('loadJson("./anim.json")') ?? -1;
    const attach = probe?.indexOf('addController("LottieController"') ?? -1;
    expect(load).toBeGreaterThanOrEqual(0);
    expect(attach).toBeGreaterThan(load);
  });

  it('SMOKE_CODES has no smoke-controller-unavailable', () => {
    expect(SMOKE_CODES as readonly string[]).not.toContain('smoke-controller-unavailable');
  });

  // FR-065: "the overlay states the behaviour that this version ships", and D-L2 is fixed
  it('the LottieController overlay states the shipped D-L2 behaviour (--bundle and dev carry the JSON)', () => {
    const overlay = readText(OVERLAY);
    const card = /^card: "(.*)"$/m.exec(FRONTMATTER.exec(overlay)?.[1] ?? '')?.[1] ?? '';
    expect(card).toContain(
      'a local relative url such as ./anim.json travels with --bundle and dev'
    );
    expect(flat(chunkOf(overlay).body)).toContain(
      '`compile --bundle` copies the file into the bundle and rewrites the url to it, and `eligian dev` serves it'
    );
    for (const stale of ['not copy', 'serves only its build output', 'yourself']) {
      expect(flat(overlay)).not.toContain(stale);
    }
  });
});
