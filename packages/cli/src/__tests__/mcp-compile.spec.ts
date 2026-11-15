/**
 * Spec 058 phase 2 (FR-010–FR-016, FR-005; SC-004): `eligian_compile` over `compileFile`, and
 * over `checkPaths` + `toMcpDiagnostics` for a program that does not compile.
 *
 * The handler is tested directly (tasks.md D3); the wire cases are T028's. The diagnostics need
 * a docs root: a minimal one (an empty index, no overlays) is written in `beforeAll`, and the
 * expected `eligian_check` diagnostics are built with the same overlays. The compiles share the
 * Langium services, so every call is awaited before the next.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type EligianMapAction, getCompilerVersion, locateConfigPath } from '@eligian/language';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPaths } from '../check/check-command.js';
import { compileFile } from '../compile-file.js';
import { CompilerLockLive } from '../mcp/compiler-lock.js';
import { withoutIds } from '../mcp/config-fragment.js';
import { toMcpDiagnostics } from '../mcp/diagnostics.js';
import type { Overlays } from '../mcp/knowledge/types.js';
import { ORIGIN_RULES } from '../mcp/origin-rules.js';
import type { EffectAi } from '../mcp/paths.js';
import {
  DESCRIPTION,
  handle,
  KEYWORDS,
  NAME,
  Parameters,
  summarizeArgs,
  type ToolContext,
} from '../mcp/tools/compile.js';
import { handle as docsHandle } from '../mcp/tools/docs.js';
import { startInMemoryServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp', 'compile');
const CLEAN = path.join(FIXTURES, 'clean');
const CLEAN_MAIN = path.join(CLEAN, 'main.eligian');
const ERROR = path.join(FIXTURES, 'error');
const REJECTED = path.join(FIXTURES, 'compile-rejected');
const LIBRARY = path.join(FIXTURES, 'library');
const EXPLAIN = path.join(FIXTURES, 'explain');
const EXPLAIN_TARGET = path.join(EXPLAIN, 'target');
const EXPLAIN_CALL = path.join(EXPLAIN, 'call');
const EXPLAIN_ERRORS = path.join(EXPLAIN, 'errors');
/** The generated docs the build writes (`generate-knowledge`, run by esbuild.mjs). */
const DIST_DOCS = path.resolve(HERE, '..', '..', 'dist', 'docs');

const OVERLAYS: Overlays = { byCode: {}, bySource: {} };

type Params = typeof Parameters.Type;
type Result = Awaited<ReturnType<typeof compileFile>>;

/** The number of `id` keys at any depth. */
const countIds = (value: unknown): number => {
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + countIds(item), 0);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).reduce(
      (sum, [key, nested]) => sum + (key === 'id' ? 1 : 0) + countIds(nested),
      0
    );
  }
  return 0;
};

/** Every value of an `id` key at any depth. */
const idsOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(idsOf);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, nested]) =>
      key === 'id' && typeof nested === 'string' ? [nested] : idsOf(nested)
    );
  }
  return [];
};

/** systemName → count over every `startOperations` / `endOperations` list, at any depth. */
const operationCounts = (value: unknown, counts: Record<string, number> = {}) => {
  if (Array.isArray(value)) for (const item of value) operationCounts(item, counts);
  else if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      if ((key === 'startOperations' || key === 'endOperations') && Array.isArray(nested)) {
        for (const op of nested as { systemName: string }[]) {
          counts[op.systemName] = (counts[op.systemName] ?? 0) + 1;
        }
      } else operationCounts(nested, counts);
    }
  }
  return counts;
};

/** FR-005: every key of `concise` but `header` is in `detailed`, deep-equal. */
const expectSuperset = (concise: object, detailed: object): void => {
  for (const [key, value] of Object.entries(concise)) {
    if (key === 'header') continue;
    expect(detailed).toHaveProperty([key]);
    expect((detailed as Record<string, unknown>)[key]).toEqual(value);
  }
};

/** The map entry of the only action named `name` (in `timelineUri`, when given). */
const mapEntry = (compiled: Result, name: string, timelineUri?: string): EligianMapAction => {
  const found = Object.values(compiled.map.actions).filter(
    action => action.name === name && action.timelineUri === timelineUri
  );
  expect(found).toHaveLength(1);
  return found[0]!;
};

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('eligian_compile', () => {
  let ai: EffectAi;
  let docsRoot: string;
  const versions = getCompilerVersion();

  beforeAll(async () => {
    ai = await import('effect/ai');
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-compile-docs-'));
    tempDirs.push(docsRoot);
    fs.writeFileSync(path.join(docsRoot, 'index.json'), '[]');
    fs.writeFileSync(path.join(docsRoot, 'overlays.json'), JSON.stringify(OVERLAYS));
  });

  const context = (cwd: string): ToolContext => ({ ai, cwd, docsRoot, versions, requestId: '1' });

  const compile = (cwd: string, params: Params) =>
    Effect.runPromise(handle(params, context(cwd)).pipe(Effect.provide(CompilerLockLive)));

  const failure = (cwd: string, params: Params) =>
    Effect.runPromise(
      Effect.flip(handle(params, context(cwd))).pipe(Effect.provide(CompilerLockLive))
    );

  /** `eligian_check`'s error diagnostics for `file` (its defaults, its builder). */
  const checkErrors = async (file: string) => {
    const results = await checkPaths([file], {
      selectorNotInLayout: 'ids',
      lint: true,
      review: true,
    });
    return toMcpDiagnostics(results, OVERLAYS, f => fs.readFileSync(f, 'utf8')).filter(
      d => d.severity === 'error'
    );
  };

  it('summary', async () => {
    const result = await compile(CLEAN, { path: 'main.eligian' });
    const compiled = await compileFile(CLEAN_MAIN, { optimize: true });

    expect(Object.keys(result)[0]).toBe('header');
    expect(result.header).toBe(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${CLEAN_MAIN}`
    );
    expect(result.ok).toBe(true);
    expect(result.view).toBe('summary');
    const summary = result.summary!;
    // Names by config index; the on enter timeline's count includes its lifecycle action (Q6)
    expect(summary.timelines).toEqual([
      {
        name: 'intro',
        uri: 'intro',
        type: 'animation',
        duration: 4,
        loop: false,
        timelineActions: 3,
      },
      {
        name: 'outro',
        uri: 'outro',
        type: 'animation',
        duration: 3,
        loop: false,
        timelineActions: 1,
      },
    ]);
    expect(summary.timelines[0]!.timelineActions).toBe(
      compiled.config.timelines[0]!.timelineActions.length
    );
    expect(summary.actions).toEqual(['highlight', 'fade', '__on__pause']);
    expect(summary.eventActions).toEqual(['celebrate']);
    expect(summary.initActions).toBe(compiled.config.initActions?.length ?? 0);
    expect(summary.operations).toEqual(operationCounts(compiled.config));
    expect(summary.operations.getControllerInstance).toBe(2);
    expect(summary.controllers).toEqual(['ProgressbarController', 'DOMEventListenerController']);
    expect(summary.chars).toBe(compiled.json.length);
    expect(result).not.toHaveProperty('cssFiles');
    expect(result).not.toHaveProperty('languages');
    expect(result).not.toHaveProperty('config');
    expect(result).not.toHaveProperty('map');
  });

  it('fragment by timeline / action / line', async () => {
    const byTimeline = await compile(CLEAN, {
      path: 'main.eligian',
      select: { timeline: 'outro' },
    });
    expect(byTimeline.view).toBe('fragment');
    expect(countIds(byTimeline.fragment)).toBe(0);
    const outro = (byTimeline.fragment as any).timelines.outro;
    expect(Object.keys((byTimeline.fragment as any).timelines)).toEqual(['outro']);
    expect(outro.timelineActions).toHaveLength(1);
    expect(outro.timelineActions[0].source).toEqual({ file: CLEAN_MAIN, line: 36, column: 3 });

    const byAction = await compile(CLEAN, {
      path: 'main.eligian',
      select: { action: 'highlight' },
    });
    expect(countIds(byAction.fragment)).toBe(0);
    expect(Object.keys((byAction.fragment as any).actions)).toEqual(['highlight']);
    expect((byAction.fragment as any).actions.highlight.source).toEqual({
      file: CLEAN_MAIN,
      line: 9,
      column: 1,
    });

    const byEvent = await compile(CLEAN, { path: 'main.eligian', select: { action: 'celebrate' } });
    expect(countIds(byEvent.fragment)).toBe(0);
    expect(Object.keys((byEvent.fragment as any).eventActions)).toEqual(['celebrate']);
    // FR-013: an event action carries its source like any action
    expect((byEvent.fragment as any).eventActions.celebrate.source).toEqual({
      file: CLEAN_MAIN,
      line: 14,
      column: 1,
    });
    const inEvent = await compile(CLEAN, { path: 'main.eligian', select: { line: 15 } });
    expect(Object.keys(inEvent.fragment as any)).toEqual(['eventActions']);
    expect(Object.keys((inEvent.fragment as any).eventActions)).toEqual(['celebrate']);

    const byLine = await compile(CLEAN, { path: 'main.eligian', select: { line: 11 } });
    expect(countIds(byLine.fragment)).toBe(0);
    expect(Object.keys((byLine.fragment as any).actions)).toEqual(['highlight']);
    expect((byLine.fragment as any).actions.highlight.source.line).toBe(9);
  });

  it('full and fragment views travel the wire (undefined config properties)', async () => {
    // The compiler leaves undefined properties in the config; the result schema rejected them
    // on the wire (JSON-RPC -32603 after a successful handler) until the views were made JSON
    const server = await startInMemoryServer({ cwd: CLEAN, docsRoot });
    try {
      const full = await server.callTool(NAME, {
        path: 'main.eligian',
        view: 'full',
        includeMap: true,
      });
      expect(full.isError).toBe(false);
      expect((full.payload as any).view).toBe('full');
      expect(Object.keys((full.payload as any).config)).toContain('timelines');
      expect(Object.keys((full.payload as any).map).length).toBeGreaterThan(0);

      const fragment = await server.callTool(NAME, {
        path: 'main.eligian',
        select: { timeline: 'intro' },
        includeMap: true,
      });
      expect(fragment.isError).toBe(false);
      expect(Object.keys((fragment.payload as any).fragment.timelines)).toEqual(['intro']);
    } finally {
      await server.close();
    }
  });

  it('line selects the innermost action whose span contains it', async () => {
    // Line 41 is past the start line of outro's action (36): only its length reaches it
    const late = await compile(CLEAN, { path: 'main.eligian', select: { line: 41 } });
    const outro = (late.fragment as any).timelines.outro;
    expect(outro.timelineActions).toHaveLength(1);
    expect(outro.timelineActions[0].source.line).toBe(36);

    // Line 23 is in the lifecycle action (20–24) and in the click listener's action (23)
    const inner = await compile(CLEAN, { path: 'main.eligian', select: { line: 23 } });
    expect(Object.keys(inner.fragment as any)).toEqual(['actions']);
    expect(Object.keys((inner.fragment as any).actions)).toEqual(['__on__pause']);

    const outer = await compile(CLEAN, { path: 'main.eligian', select: { line: 21 } });
    const intro = (outer.fragment as any).timelines.intro;
    expect(intro.timelineActions.map((a: { name: string }) => a.name)).toEqual([
      'timeline-lifecycle',
    ]);
  });

  it('full deep-equals compileFile().config', async () => {
    const result = await compile(CLEAN, { path: 'main.eligian', view: 'full' });
    const compiled = await compileFile(CLEAN_MAIN, { optimize: true });
    expect(result.view).toBe('full');
    // The ids are kept (locateConfigPath addresses them); they are random per compile
    expect(countIds(result.config)).toBe(countIds(compiled.config));
    expect(countIds(result.config)).toBeGreaterThan(0);
    expect(withoutIds(result.config)).toEqual(withoutIds(compiled.config));
  });

  it('error program equals check errors (code, line, column)', async () => {
    const result = await compile(ERROR, { path: 'main.eligian' });
    const expected = await checkErrors(path.join(ERROR, 'main.eligian'));
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('summary');
    expect(result).not.toHaveProperty('config');
    expect(expected.map(d => d.code)).toContain('unknown_operation');
    const pick = (d: { code: string; line: number; column: number }) => ({
      code: d.code,
      line: d.line,
      column: d.column,
    });
    expect(result.diagnostics!.map(pick)).toEqual(expected.map(pick));
    expect(result.diagnostics).toEqual(expected);
  });

  it("a rejected compile: the compile-failed diagnostics equal check's", async () => {
    const result = await compile(REJECTED, { path: 'main.eligian' });
    const expected = await checkErrors(path.join(REJECTED, 'main.eligian'));
    expect(result.ok).toBe(false);
    expect(expected.map(d => d.code)).toContain('locales-import-error');
    expect(result.diagnostics).toEqual(expected);
  });

  it('unknown selection lists the names', async () => {
    const timeline = await failure(CLEAN, { path: 'main.eligian', select: { timeline: 'nope' } });
    expect(timeline._tag).toBe('ToolNotFound');
    expect(timeline.message).toContain('nope');
    expect(timeline.message).toContain('intro');
    expect(timeline.message).toContain('outro');

    const action = await failure(CLEAN, { path: 'main.eligian', select: { action: 'nope' } });
    expect(action._tag).toBe('ToolNotFound');
    for (const name of ['highlight', 'fade', 'celebrate']) expect(action.message).toContain(name);
  });

  it('line outside every action → not-found listing the two nearest ranges', async () => {
    const error = await failure(CLEAN, { path: 'main.eligian', select: { line: 4 } });
    expect(error._tag).toBe('ToolNotFound');
    expect(error.message).toContain('highlight: lines 9-12');
    // FR-013: the event action (14–17) is in the map now, so it is the second nearest
    expect(error.message).toContain('celebrate: lines 14-17');
    expect(error.message).not.toContain('timeline-lifecycle');
    expect(error.message).not.toContain('timeline-action-0-3');
  });

  it('includeMap adds the EligianMapAction of each returned action, keyed like the fragment (and map.actions with full)', async () => {
    const compiled = await compileFile(CLEAN_MAIN, { optimize: true });

    const timeline = await compile(CLEAN, {
      path: 'main.eligian',
      select: { timeline: 'outro' },
      includeMap: true,
    });
    expect(timeline.map).toEqual({
      timelines: { outro: [mapEntry(compiled, 'timeline-action-0-3', 'outro')] },
    });

    const action = await compile(CLEAN, {
      path: 'main.eligian',
      select: { action: 'highlight' },
      includeMap: true,
    });
    expect(action.map).toEqual({ actions: { highlight: mapEntry(compiled, 'highlight') } });

    const line = await compile(CLEAN, {
      path: 'main.eligian',
      select: { line: 23 },
      includeMap: true,
    });
    expect(line.map).toEqual({ actions: { __on__pause: mapEntry(compiled, '__on__pause') } });

    const without = await compile(CLEAN, { path: 'main.eligian', select: { action: 'highlight' } });
    expect(without).not.toHaveProperty('map');

    const full = await compile(CLEAN, { path: 'main.eligian', view: 'full', includeMap: true });
    const map = full.map as Record<string, EligianMapAction>;
    const actionIds = [
      ...(full.config as any).actions,
      ...(full.config as any).eventActions,
      ...((full.config as any).initActions ?? []),
      ...(full.config as any).timelines.flatMap((t: any) => t.timelineActions),
    ].map((a: { id: string }) => a.id);
    expect(Object.keys(map).sort()).toEqual(actionIds.sort());
    for (const id of actionIds) expect(idsOf(full.config)).toContain(id);
  });

  it('detailed ⊇ concise (summary, fragment)', async () => {
    const concise = await compile(CLEAN, { path: 'main.eligian' });
    const detailed = await compile(CLEAN, { path: 'main.eligian', response_format: 'detailed' });
    expectSuperset(concise, detailed);
    expect(detailed.cssFiles).toEqual(['./styles.css']);
    expect(detailed.languages).toEqual([{ languageCode: 'en-US', label: 'English' }]);

    const params: Params = {
      path: 'main.eligian',
      select: { timeline: 'intro' },
      includeMap: true,
    };
    const fragment = await compile(CLEAN, params);
    const fragmentDetailed = await compile(CLEAN, { ...params, response_format: 'detailed' });
    expectSuperset(fragment, fragmentDetailed);
  });

  it('library file → { ok: false, library: true }, no diagnostics', async () => {
    const result = await compile(LIBRARY, { path: 'lib.eligian' });
    expect(result).toEqual({
      header: `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${path.join(LIBRARY, 'lib.eligian')}`,
      ok: false,
      library: true,
    });
  });

  it('missing file → not-found', async () => {
    const error = await failure(CLEAN, { path: 'missing.eligian' });
    expect(error._tag).toBe('ToolNotFound');
    expect(error.path).toBe(path.join(CLEAN, 'missing.eligian'));
  });

  it('declares the explain parameter (Phase 3)', () => {
    expect(Object.keys(Parameters.fields).sort()).toEqual([
      'explain',
      'includeMap',
      'path',
      'response_format',
      'select',
      'view',
    ]);
    expect(DESCRIPTION.length).toBeLessThanOrEqual(16_384);
    expect(KEYWORDS).toEqual(['compile', 'json', 'config', 'eligius', 'map']);
    for (const keyword of KEYWORDS) {
      expect(DESCRIPTION.slice(0, 200).toLowerCase()).toContain(keyword);
    }
  });

  describe('explain', () => {
    type Explained = NonNullable<Awaited<ReturnType<typeof compile>>['explain']>;
    type Entry = NonNullable<Explained['operations']>[number];

    const distinctOrigins = (explained: Explained): string[] =>
      [...new Set((explained.operations ?? []).map(op => op.origin))].sort();

    /** The value at a `locateConfigPath`-notation path. */
    const at = (value: unknown, jsonPath: string): unknown => {
      let current = value;
      for (const [, key, index] of jsonPath.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
        current =
          index !== undefined
            ? (current as unknown[])[Number(index)]
            : (current as Record<string, unknown>)[key!];
      }
      return current;
    };

    it('US3-1: both target selects have origin target, rules name the docs id', async () => {
      const result = await compile(EXPLAIN_TARGET, {
        path: 'main.eligian',
        select: { timeline: 'Intro' },
        explain: true,
      });
      expect(result.ok).toBe(true);
      const explained = result.explain!;
      const selects = explained.operations!.filter(op => op.systemName === 'selectElement');
      expect(selects).toHaveLength(2);
      for (const op of selects) expect(op.origin).toBe('target');
      expect(selects.map(op => op.path)).toEqual([
        'timelines[0].timelineActions[0].startOperations[0]',
        'timelines[0].timelineActions[0].endOperations[0]',
      ]);
      expect(selects[0]!.location).toMatchObject({ line: 7 });
      expect(explained.rules.target).toEqual(ORIGIN_RULES.target);
      expect(explained.rules.target!.docs).toBe(ORIGIN_RULES.target.docs);
    });

    it('US3-2: the requestAction / startAction pair has origin call', async () => {
      const result = await compile(EXPLAIN_CALL, {
        path: 'main.eligian',
        select: { timeline: 'Intro' },
        explain: true,
      });
      const operations = result.explain!.operations!;
      expect(operations.map(op => [op.systemName, op.origin])).toEqual([
        ['requestAction', 'call'],
        ['startAction', 'call'],
        ['requestAction', 'call'],
        ['startAction', 'call'],
      ]);
      expect(result.explain!.rules).toEqual({ call: ORIGIN_RULES.call });
    });

    it('rules list exactly the present origins', async () => {
      const cases: readonly (readonly [string, Params])[] = [
        [EXPLAIN_TARGET, { path: 'main.eligian', select: { timeline: 'Intro' } }],
        [EXPLAIN_CALL, { path: 'main.eligian', select: { action: 'reveal' } }],
        [CLEAN, { path: 'main.eligian', view: 'full' }],
        [CLEAN, { path: 'main.eligian', select: { line: 23 } }],
      ];
      for (const [cwd, params] of cases) {
        const explained = (await compile(cwd, { ...params, explain: true })).explain!;
        expect(Object.keys(explained.rules).sort(), JSON.stringify(params)).toEqual(
          distinctOrigins(explained)
        );
        for (const [origin, rule] of Object.entries(explained.rules)) {
          expect(rule).toEqual(ORIGIN_RULES[origin as keyof typeof ORIGIN_RULES]);
        }
      }
    });

    it('each docs id resolves through eligian_docs', async () => {
      if (!fs.existsSync(path.join(DIST_DOCS, 'index.json'))) {
        throw new Error(`${DIST_DOCS} is missing: run pnpm -C packages/cli build`);
      }
      const docs = new Set<string>();
      for (const cwd of [EXPLAIN_TARGET, EXPLAIN_CALL, CLEAN]) {
        const result = await compile(cwd, { path: 'main.eligian', view: 'full', explain: true });
        for (const rule of Object.values(result.explain!.rules)) docs.add(rule.docs);
      }
      const ids = [...docs];
      expect(ids.length).toBeGreaterThan(1);
      // eligian_docs takes at most 6 ids per call
      for (let i = 0; i < ids.length; i += 6) {
        const chunk = ids.slice(i, i + 6);
        const payload = await Effect.runPromise(
          docsHandle(
            { ids: chunk },
            { ai, cwd: CLEAN, docsRoot: DIST_DOCS, versions, requestId: '1' }
          )
        );
        expect(payload.unknown ?? []).toEqual([]);
        expect((payload.cards ?? []).map(card => card.id).sort()).toEqual([...chunk].sort());
      }
    });

    it('summary: per-origin counts sum to the operation count, no operations list', async () => {
      const result = await compile(CLEAN, { path: 'main.eligian', view: 'summary', explain: true });
      const explained = result.explain!;
      expect(explained).not.toHaveProperty('operations');
      const total = Object.values(result.summary!.operations).reduce((a, b) => a + b, 0);
      const counted = Object.values(explained.counts!).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      expect(counted).toBe(total);
      expect(Object.keys(explained.rules).sort()).toEqual(Object.keys(explained.counts!).sort());
      // The fixture has calls, a lifecycle block and an interaction: more than one origin
      expect(Object.keys(explained.counts!).length).toBeGreaterThan(1);
    });

    it('full: one entry per emitted operation keyed by path, within maxResultSizeChars', async () => {
      const result = await compile(CLEAN, {
        path: 'main.eligian',
        view: 'full',
        includeMap: true,
        explain: true,
      });
      const operations: readonly Entry[] = result.explain!.operations!;
      const total = Object.values(operationCounts(result.config)).reduce((a, b) => a + b, 0);
      expect(operations).toHaveLength(total);
      expect(new Set(operations.map(op => op.path)).size).toBe(total);
      const map = { version: 1 as const, actions: result.map as Record<string, EligianMapAction> };
      const config = result.config as Parameters<typeof locateConfigPath>[1];
      for (const op of operations) {
        const found = at(config, op.path) as { systemName: string } | undefined;
        expect(found?.systemName, op.path).toBe(op.systemName);
        if (op.location !== undefined) {
          expect(locateConfigPath(map, config, op.path), op.path).toEqual(op.location);
        }
      }
      expect(result.explain).not.toHaveProperty('counts');
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(200_000);
    });

    it('a program with errors has no explain', async () => {
      const result = await compile(EXPLAIN_ERRORS, { path: 'main.eligian', explain: true });
      expect(result.ok).toBe(false);
      expect(result.diagnostics!.map(d => d.code)).toContain('unknown_operation');
      expect(result).not.toHaveProperty('explain');
    });

    it('concise ⊆ detailed with explain', async () => {
      const summary = await compile(CLEAN, { path: 'main.eligian', explain: true });
      const summaryDetailed = await compile(CLEAN, {
        path: 'main.eligian',
        explain: true,
        response_format: 'detailed',
      });
      expectSuperset(summary, summaryDetailed);
      expect(summaryDetailed).toHaveProperty('explain');

      const params: Params = {
        path: 'main.eligian',
        select: { timeline: 'intro' },
        explain: true,
      };
      const fragment = await compile(CLEAN, params);
      const fragmentDetailed = await compile(CLEAN, { ...params, response_format: 'detailed' });
      expectSuperset(fragment, fragmentDetailed);
      expect(fragmentDetailed.explain!.operations!.length).toBeGreaterThan(0);
    });

    it('without explain there is no explain key', async () => {
      const cases: readonly Params[] = [
        { path: 'main.eligian' },
        { path: 'main.eligian', view: 'full' },
        { path: 'main.eligian', select: { timeline: 'intro' } },
        { path: 'main.eligian', select: { timeline: 'intro' }, explain: false },
      ];
      for (const params of cases) {
        expect(await compile(CLEAN, params), JSON.stringify(params)).not.toHaveProperty('explain');
      }
    });

    it('travels the wire', async () => {
      const server = await startInMemoryServer({ cwd: EXPLAIN_TARGET, docsRoot });
      try {
        const response = await server.callTool(NAME, {
          path: 'main.eligian',
          select: { timeline: 'Intro' },
          explain: true,
        });
        expect(response.isError).toBe(false);
        expect(Object.keys((response.payload as any).explain.rules)).toContain('target');
      } finally {
        await server.close();
      }
    });

    it('summarizeArgs records explain', () => {
      expect(summarizeArgs({ path: 'main.eligian', explain: true })).toEqual({
        view: 'summary',
        explain: true,
      });
      expect(summarizeArgs({ path: 'main.eligian', explain: false }).explain).toBe(false);
      expect(summarizeArgs({ path: 'main.eligian' })).not.toHaveProperty('explain');
    });
  });
});
