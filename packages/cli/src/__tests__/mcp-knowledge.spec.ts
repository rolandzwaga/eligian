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
  STARTERS,
} from '@eligian/language';
import { LINT_RULES_CHECKED_BY_ELIGIAN } from '@eligian/language/eligius-lint';
import { CONTROLLERS, getOrCreateServices, TIMELINE_EVENTS } from '@eligian/language/mcp';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import {
  type DiagnosticCodeRanking,
  RANKING_FILE,
  rankDiagnosticCodes,
  SELECTION_SIZE,
} from '../../scripts/rank-diagnostic-codes.js';
import { REVIEW_CODES } from '../check/review.js';
import { sourceOf } from '../mcp/diagnostics.js';
import { ELIGIUS_LINT_RULES } from '../mcp/knowledge/lint-rules.js';
import { eventName } from '../mcp/knowledge/render.js';
import type { IndexEntry, Overlays } from '../mcp/knowledge/types.js';

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

/** The 13 hand-written chunks of FR-039 and their kinds. */
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
  storyboard: 'workflow',
};

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
    expect(counts).toEqual({ orientation: 5, mapping: 5, runtime: 2, workflow: 1 });

    // The curriculum is exactly these chunks: no hand-written chunk outside the list
    const ids = [...curriculumSources().values()].map(text => chunkOf(text).id);
    expect(ids.sort()).toEqual(Object.keys(FR_039_CHUNKS).sort());
  }, 120_000);

  it('runtime chunks teach only probed claims', () => {
    const claims = runtimeClaims();
    expect(claims.length).toBeGreaterThan(0);
    const model = readText(EXECUTION_MODEL);
    const runtime = [...curriculumSources()].filter(([name]) => name.startsWith('runtime-'));
    expect(runtime.map(([name]) => name)).toEqual([
      'runtime-engine-lifecycle.md',
      'runtime-scheduling.md',
    ]);

    for (const [name, text] of runtime) {
      const { body } = chunkOf(text);
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

  it('every map-* probe matches its snapshot', async () => {
    const outDir = await generatedDocs();
    const mapChunks = Object.keys(FR_039_CHUNKS)
      .filter(id => id.startsWith('map-'))
      .sort();
    expect(mapChunks).toHaveLength(5);
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

  /** The FR-036 catalogue: every code `eligian_check` can report. */
  const catalogue = (): string[] =>
    [
      ...new Set([
        ...DIAGNOSTIC_CODES.map(entry => entry.code),
        ...REVIEW_CODES,
        'compile-failed',
        ...ELIGIUS_LINT_RULES.map(rule => `eligius-${rule}`),
      ]),
    ].sort();

  const allowlist = (): string[] => JSON.parse(readText(MISSING_OVERLAYS));

  const committedRanking = (): DiagnosticCodeRanking => JSON.parse(readText(RANKING_FILE));

  it('missing overlays are exactly the allowlist', () => {
    const overlays = codeOverlays();
    for (const [code, name] of overlays) expect(name, code).toBe(`${code}.md`);

    const codes = catalogue();
    const missing = codes.filter(code => !overlays.has(code));
    const listed = allowlist();
    expect(listed, 'the allowlist is sorted, without duplicates').toEqual(
      [...new Set(listed)].sort()
    );
    // A code missing from the docs and not on the list fails
    expect(missing.filter(code => !listed.includes(code))).toEqual([]);
    // A listed code that gained an overlay (or left the catalogue) fails until it is removed
    expect(listed.filter(code => !missing.includes(code))).toEqual([]);
    // SC-013: the 30 selected codes have overlays, so the list is at most catalogue − 30
    expect(listed.length).toBeLessThanOrEqual(codes.length - SELECTION_SIZE);
  });

  it('the review overlays exist and are not allowlisted', async () => {
    expect([...REVIEW_CODES].sort()).toEqual(['class-never-removed', 'controller-imbalance']);
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

  // T048 timed the ranking at ~2 s locally (baseline/ranking-time.txt), so it runs everywhere
  it('the ranking selection equals the script output', async () => {
    const ranking = await rankDiagnosticCodes();
    const committed = committedRanking();
    expect(ranking.selection).toHaveLength(SELECTION_SIZE);
    expect(committed.selection).toEqual(ranking.selection);
    expect(committed.caseCodes).toEqual(ranking.caseCodes);
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
