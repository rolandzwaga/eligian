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
import { type EligianMapAction, getCompilerVersion } from '@eligian/language';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPaths } from '../check/check-command.js';
import { compileFile } from '../compile-file.js';
import { CompilerLockLive } from '../mcp/compiler-lock.js';
import { withoutIds } from '../mcp/config-fragment.js';
import { toMcpDiagnostics } from '../mcp/diagnostics.js';
import type { Overlays } from '../mcp/knowledge/types.js';
import type { EffectAi } from '../mcp/paths.js';
import {
  DESCRIPTION,
  handle,
  KEYWORDS,
  NAME,
  Parameters,
  type ToolContext,
} from '../mcp/tools/compile.js';
import { startInMemoryServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp', 'compile');
const CLEAN = path.join(FIXTURES, 'clean');
const CLEAN_MAIN = path.join(CLEAN, 'main.eligian');
const ERROR = path.join(FIXTURES, 'error');
const REJECTED = path.join(FIXTURES, 'compile-rejected');
const LIBRARY = path.join(FIXTURES, 'library');

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

  it('declares no explain parameter', () => {
    expect(Object.keys(Parameters.fields).sort()).toEqual([
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
});
