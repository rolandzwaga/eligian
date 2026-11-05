/**
 * Spec 058 Phase 1 (FR-019; plan C7): the knowledge loader and the keyword search behind
 * `eligian_docs({ query })`, over the `docs-mini` fixture (the generator's layout in small).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Effect } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { ToolInternal } from '../mcp/errors.js';
import { loadKnowledge } from '../mcp/knowledge/load.js';
import { searchIndex } from '../mcp/knowledge/search.js';
import type { IndexEntry, Knowledge } from '../mcp/knowledge/types.js';

const DOCS_MINI = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'mcp',
  'docs-mini'
);

const tempDirs: string[] = [];
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-docs-'));
  tempDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const load = (docsRoot: URL | string): Promise<Knowledge> =>
  Effect.runPromise(loadKnowledge(docsRoot));

/** An in-memory knowledge base: `searchIndex` takes only index, headings and body. */
const memory = (
  entries: ReadonlyArray<Partial<IndexEntry> & { id: string }>,
  headings: Readonly<Record<string, readonly string[]>> = {},
  bodies: Readonly<Record<string, string>> = {}
): Pick<Knowledge, 'index' | 'headings' | 'body'> => ({
  index: entries.map(entry => ({
    title: entry.id,
    kind: 'reference',
    use_cases: [],
    words: 0,
    see: [],
    card: '',
    ...entry,
  })),
  headings: id => headings[id] ?? [],
  body: id => bodies[id],
});

describe('loadKnowledge', () => {
  it('reads index, bodies without frontmatter, ## headings, overlays', async () => {
    const knowledge = await load(DOCS_MINI);

    expect(knowledge.index.map(entry => entry.id)).toEqual([
      'controllers',
      'map-dataflow',
      'operation/addClass',
      'operation/selectElement',
      'operations-index',
      'what-is-eligian',
    ]);
    expect(knowledge.index[3]).toMatchObject({
      id: 'operation/selectElement',
      title: 'selectElement',
      kind: 'operation',
    });

    const body = knowledge.body('operation/selectElement');
    expect(body).toBeDefined();
    expect(body).not.toContain('---');
    expect(body).not.toContain('id: operation/selectElement');
    expect(body?.startsWith('NEEDS: none')).toBe(true);
    expect(body).toContain('see: operations-index');
    expect(knowledge.body('map-dataflow')).toContain('one operation data object');
    expect(knowledge.body('no-such-chunk')).toBeUndefined();

    // `##` headings only, none from inside a fenced block
    expect(knowledge.headings('controllers')).toEqual(['Lottie', 'Routing']);
    expect(knowledge.headings('map-dataflow')).toEqual(['Erased parameters', 'Persistent outputs']);
    expect(knowledge.headings('no-such-chunk')).toEqual([]);

    // an overlay file has no `id`: it is not a chunk
    expect(knowledge.body('diagnostic/missing-dependency')).toBeUndefined();
    expect(knowledge.overlays.byCode['missing-dependency']).toEqual({
      docs: 'diagnostic/missing-dependency',
      fix: 'Call the operation that provides the missing property first.',
    });
    expect(knowledge.overlays.bySource.validator?.docs).toBe('diagnostic/source-validator');
  });

  it('a missing index.json is ToolInternal naming docsRoot', async () => {
    const empty = tempDir();
    const error = await Effect.runPromise(Effect.flip(loadKnowledge(empty)));
    expect(error).toBeInstanceOf(ToolInternal);
    expect(error._tag).toBe('ToolInternal');
    expect(error.message).toContain(empty);
    expect(error.path).toBe(empty);
  });

  it('cached per docsRoot', async () => {
    const first = await load(DOCS_MINI);
    expect(await load(DOCS_MINI)).toBe(first);
    expect(await load(pathToFileURL(`${DOCS_MINI}${path.sep}`))).toBe(first);

    const copy = tempDir();
    fs.cpSync(DOCS_MINI, copy, { recursive: true });
    const other = await load(copy);
    expect(other).not.toBe(first);
    expect(other.index.map(entry => entry.id)).toEqual(first.index.map(entry => entry.id));
  });
});

describe('searchIndex', () => {
  it('an operation name routes to operation/<name> then operations-index', async () => {
    const knowledge = await load(DOCS_MINI);

    for (const query of ['selectElement', 'how do I use selectelement?']) {
      const hits = searchIndex(knowledge, query);
      expect(hits.map(hit => hit.id).slice(0, 2)).toEqual([
        'operation/selectElement',
        'operations-index',
      ]);
      expect(new Set(hits.map(hit => hit.id)).size).toBe(hits.length);
    }

    // without an operation name there is no routing
    expect(searchIndex(knowledge, 'routing')[0]?.id).toBe('controllers');
  });

  it('at most limit hits, default 8', () => {
    const entries = Array.from({ length: 12 }, (_, n) => ({
      id: `chunk-${String(n).padStart(2, '0')}`,
      title: 'Timeline',
    }));
    const knowledge = memory(entries);

    expect(searchIndex(knowledge, 'timeline')).toHaveLength(8);
    expect(searchIndex(knowledge, 'timeline', 3)).toHaveLength(3);
    expect(searchIndex(knowledge, 'timeline', 20)).toHaveLength(12);
    // an entry that matches nothing is not a hit
    expect(searchIndex(knowledge, 'nothing-matches-this')).toEqual([]);
  });

  it('ties by id; best heading returned', () => {
    const knowledge = memory(
      [
        { id: 'b-entry', title: 'Timeline basics' },
        { id: 'a-entry', title: 'Timeline basics' },
        { id: 'c-entry', title: 'Other', card: 'Timeline providers in depth.' },
      ],
      { 'c-entry': ['Intro', 'Timeline basics', 'Timeline providers', 'Outro'] }
    );

    const hits = searchIndex(knowledge, 'timeline providers');
    expect(hits.map(hit => hit.id)).toEqual(['c-entry', 'a-entry', 'b-entry']);
    expect(hits[1]?.score).toBe(hits[2]?.score);
    expect(hits[0]?.heading).toBe('Timeline providers');
    expect(hits[1]?.heading).toBeUndefined();
  });

  it('scores id/title 8, use_cases 4, card 3, heading 2, body log2(1 + count) off operations', () => {
    const knowledge = memory(
      [
        { id: 'by-title', title: 'Fade' },
        { id: 'by-use-case', use_cases: ['fade in'] },
        { id: 'by-card', card: 'A fade.' },
        { id: 'by-heading' },
        { id: 'by-body' },
        { id: 'operation/byBody', kind: 'operation' },
      ],
      { 'by-heading': ['Fade'] },
      { 'by-body': 'fade fade fade', 'operation/byBody': 'fade fade fade' }
    );

    const scores = Object.fromEntries(
      searchIndex(knowledge, 'fade', 20).map(hit => [hit.id, hit.score])
    );
    expect(scores).toEqual({
      'by-title': 8,
      'by-use-case': 4,
      'by-card': 3,
      'by-heading': 2,
      'by-body': 2,
    });
  });

  it('camelCase and punctuation tokenised', async () => {
    const knowledge = await load(DOCS_MINI);

    for (const query of ['add-class', 'ADD_CLASS??', 'add, class.']) {
      expect(searchIndex(knowledge, query)[0]?.id).toBe('operation/addClass');
    }
    // `selectedElement` in a card is the tokens `selected` and `element`
    expect(searchIndex(knowledge, 'selected element')[0]?.id).toBe('operation/selectElement');
    // the use case and the heading `Erased parameters`
    expect(searchIndex(knowledge, 'erased-parameters')[0]).toMatchObject({
      id: 'map-dataflow',
      heading: 'Erased parameters',
    });
  });
});
