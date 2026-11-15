/**
 * Spec 058 Phase 2 (FR-020–FR-027, FR-005; SC-005): `eligian_project`, the project inventory.
 *
 * The handler is tested directly; the wire cases follow with the server registration (T028).
 * The fixture `__fixtures__/mcp/project/` seeds every set: four timelines (A and B share a
 * video file, C plays a missing audio file, D is a raf timeline in a container the layout
 * lacks, with `on enter`), an action whose parameter reaches `selectElement`, a layout, two CSS
 * files, a two-language `locales.json`, a library, a host module and a STORYBOARD.md. The
 * siblings cover the edge cases. The tool reads the fixture in place: the last case proves it
 * writes nothing and leaves no document in the shared workspace.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCompilerVersion, getOrCreateServices, STARTERS } from '@eligian/language';
import { Effect, Schema } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileFile } from '../compile-file.js';
import { CompilerLockLive } from '../mcp/compiler-lock.js';
import type { EffectAi } from '../mcp/paths.js';
import type { ToolContext } from '../mcp/tools/check.js';
import { DESCRIPTION, handle, KEYWORDS, type Parameters, Success } from '../mcp/tools/project.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '__fixtures__', 'mcp', 'project');
const at = (...parts: string[]): string => path.join(FIXTURES, ...parts);
const versions = getCompilerVersion();

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Every file under `dir` (recursive). */
const filesUnder = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(entry =>
      entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
    );

/** sha256 and mtime of every fixture file. */
const fingerprint = (): Record<string, string> =>
  Object.fromEntries(
    filesUnder(FIXTURES).map(file => [
      file,
      `${createHash('sha256').update(fs.readFileSync(file)).digest('hex')} ${fs.statSync(file).mtimeMs}`,
    ])
  );

const documentCount = (): number =>
  getOrCreateServices().shared.workspace.LangiumDocuments.all.count();

describe('eligian_project', () => {
  let ai: EffectAi;

  beforeAll(async () => {
    ai = await import('effect/ai');
  });

  const context = (cwd: string): ToolContext => ({
    ai,
    cwd,
    docsRoot: cwd,
    versions,
    requestId: '1',
  });

  const project = (params: typeof Parameters.Type, cwd = FIXTURES) =>
    Effect.runPromise(handle(params, context(cwd)).pipe(Effect.provide(CompilerLockLive)));

  const failure = (params: typeof Parameters.Type, cwd = FIXTURES) =>
    Effect.runPromise(
      handle(params, context(cwd)).pipe(Effect.flip, Effect.provide(CompilerLockLive))
    );

  /** The one program section of a file input. */
  const programOf = async (input: string, cwd = FIXTURES) => {
    const result = await project({ path: input }, cwd);
    expect(result.programs).toHaveLength(1);
    return result.programs[0]!;
  };

  it('names', async () => {
    const program = await programOf('main.eligian');
    expect(program.file).toBe(at('main.eligian'));
    expect(program.css).toEqual({
      classes: ['ghostc', 'lit', 'visible'],
      ids: ['banner', 'stage'],
    });
    expect(program.layout).toEqual({
      ids: ['stage', 'subtitle', 'title'],
      classes: ['frame', 'heading'],
    });
    expect(program.selectors).toEqual({
      classes: ['frame', 'ghostc', 'heading', 'lit', 'visible'],
      ids: ['banner', 'stage', 'subtitle', 'title'],
    });
    expect(program.locales).toEqual({
      languages: ['en-US', 'nl-NL'],
      keys: ['greeting', 'nav.about', 'nav.home'],
    });
    expect(program.host).toEqual({
      operations: [
        {
          name: 'trackEvent',
          parameters: [
            { name: 'eventName', type: 'string', optional: false },
            { name: 'weight', type: 'number', optional: true },
          ],
        },
      ],
      controllers: [
        { name: 'Confetti', parameters: [{ name: 'count', type: 'number', optional: false }] },
      ],
      functions: [{ name: 'formatPrice', parameters: [] }],
    });
    expect(program.files).toEqual([
      { path: at('main.eligian'), kind: 'entry', exists: true },
      { path: at('lib', 'anim.eligian'), kind: 'library', exists: true },
      { path: at('layout.html'), kind: 'layout', exists: true },
      { path: at('styles.css'), kind: 'styles', exists: true },
      { path: at('locales.json'), kind: 'locales', exists: true },
      { path: at('theme.css'), kind: 'asset', exists: true },
      { path: at('media', 'present.mp4'), kind: 'media', exists: true },
      { path: at('media', 'missing.mp3'), kind: 'media', exists: false },
      { path: at('host.ts'), kind: 'host', exists: true },
    ]);
  });

  it('no languages block → locales.languages []', async () => {
    const program = await programOf('no-languages/main.eligian');
    expect(program.locales).toEqual({ languages: [], keys: [] });
    expect(program.host).toEqual({ operations: [], controllers: [], functions: [] });
  });

  it('outline equals the expected tree', async () => {
    const program = await programOf('main.eligian');
    const event = (name: string, detail: string, line: number) => ({
      kind: 'Event',
      name,
      detail,
      line,
    });
    const mediaTimeline = (name: string, line: number, provider: string, from: string) => ({
      kind: 'Module',
      name: `timeline "${name}"`,
      detail: `${provider} · 0s..1s`,
      line,
      container: '#stage',
      provider,
      from,
      duration: 1,
      children: [event('at 0s..1s', name === 'C' ? 'fade' : 'highlight', line + 1)],
    });
    expect(program.outline).toEqual([
      { kind: 'Variable', name: 'theme', detail: 'import "./theme.css"', line: 12 },
      { kind: 'Constant', name: 'beat', detail: '2s', line: 21 },
      {
        kind: 'Function',
        name: 'highlight',
        detail: 'action(target)',
        line: 23,
        parameters: [{ name: 'target', role: 'selector' }],
      },
      { kind: 'Event', name: 'languageChanged', detail: 'on event "language-change"', line: 28 },
      mediaTimeline('A', 33, 'video', './media/present.mp4'),
      mediaTimeline('B', 37, 'video', './media/present.mp4'),
      mediaTimeline('C', 41, 'audio', './media/missing.mp3'),
      {
        kind: 'Module',
        name: 'timeline "D"',
        detail: 'raf · 0s..3s',
        line: 45,
        container: '.ghostc',
        provider: 'raf',
        duration: 3,
        children: [
          event('on enter', 'selectElement, addClass', 46),
          event('at 0s..2s', 'highlight', 50),
          event('at 2s..3s', 'fade', 51),
        ],
      },
    ]);
  });

  it('assets.problems is exactly the seeded three', async () => {
    const program = await programOf('main.eligian');
    expect(program.assets.problems.map(p => [p.code, p.path, p.line, p.column])).toEqual([
      ['media-from-duplicate', at('media', 'present.mp4'), 37, 43],
      ['media-file-missing', at('media', 'missing.mp3'), 41, 43],
      ['timeline-container-not-in-layout', undefined, 45, 17],
    ]);
    expect(program.assets.problems[0]!.message).toContain('"A"');
    expect(program.assets.problems[1]!.message).toContain('"C"');
    expect(program.assets.problems[2]!.message).toContain('.ghostc');
  });

  it('missing named asset import', async () => {
    const program = await programOf('missing-asset/main.eligian');
    const hint = at('missing-asset', 'hint.html');
    expect(program.assets.problems).toEqual([
      {
        code: 'import_file_not_found',
        message: expect.stringContaining('./hint.html'),
        path: hint,
        line: 2,
        column: 1,
      },
    ]);
    expect(program.files).toContainEqual({ path: hint, kind: 'asset', exists: false });
  });

  it('malformed locales.json → keys [] and one locales-parse-failed problem, no isError', async () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-project-')));
    tempDirs.push(dir);
    fs.cpSync(at('bad-locales'), dir, { recursive: true });
    // Written here: Biome would refuse a committed invalid .json
    fs.writeFileSync(
      path.join(dir, 'locales.json'),
      '{\n  "en-US": {\n    "greeting": "Hello",\n  }\n}\n'
    );
    const program = await programOf('main.eligian', dir);
    expect(program.locales).toEqual({ languages: ['en-US'], keys: [] });
    expect(program.assets.problems).toEqual([
      {
        code: 'locales-parse-failed',
        message: expect.stringContaining('Failed to parse locales file'),
        path: path.join(dir, 'locales.json'),
        line: 7,
        column: 1,
      },
    ]);
  });

  it('storyboard counts ranged actions only', async () => {
    const program = await programOf('main.eligian');
    expect(program.storyboard?.timelines).toEqual([
      { timeline: 'D', beats: 2, timelineActions: 2 },
    ]);
    // The compile summary counts the raw timeline actions: the `on enter` lifecycle action too
    const compiled = await compileFile(at('main.eligian'));
    expect(compiled.config.timelines[3]!.timelineActions).toHaveLength(3);
  });

  it('unknown beat timeline and a 5-cell row are counted', async () => {
    const program = await programOf('main.eligian');
    expect(program.storyboard).toEqual({
      timelines: [{ timeline: 'D', beats: 2, timelineActions: 2 }],
      unknownTimelines: ['Ghost'],
      interactions: 1,
      ignoredRows: 1,
    });
  });

  it('storyboard on a non-compiling program gives timelineActions null', async () => {
    const program = await programOf('no-compile/main.eligian');
    expect(program.storyboard).toEqual({
      timelines: [{ timeline: 'main', beats: 1, timelineActions: null }],
      unknownTimelines: [],
      interactions: 0,
      ignoredRows: 0,
    });
    expect(program.outline).toContainEqual(
      expect.objectContaining({ name: 'timeline "main"', duration: null })
    );
  });

  it('no STORYBOARD.md → storyboard null', async () => {
    const program = await programOf('no-languages/main.eligian');
    expect(program.storyboard).toBeNull();
  });

  it('detailed ⊇ concise', async () => {
    const { header: conciseHeader, ...concise } = await project({ path: 'main.eligian' });
    const { header: detailedHeader, ...detailed } = await project({
      path: 'main.eligian',
      response_format: 'detailed',
    });
    expect(detailedHeader).toBe(conciseHeader);
    // The declared Success schema carries every key (the server encodes the result with it)
    for (const result of [concise, detailed]) {
      const full = { header: conciseHeader, ...result };
      expect(Schema.encodeUnknownSync(Success)(full)).toEqual(full);
    }
    expect(detailed).toMatchObject(concise);
    expect(concise).not.toHaveProperty('starters');
    expect(detailed.starters).toEqual(
      STARTERS.map(starter => ({ name: starter.name, description: starter.description }))
    );
    const program = detailed.programs[0]!;
    expect(program.files.find(f => f.kind === 'entry')?.bytes).toBe(
      fs.statSync(at('main.eligian')).size
    );
    expect(program.files.find(f => !f.exists)).not.toHaveProperty('bytes');
    expect(concise.programs[0]!.files.every(f => f.bytes === undefined)).toBe(true);
    expect(program.locales.keyLanguages).toEqual([
      { id: 'greeting', languageCodes: ['en-US', 'nl-NL'] },
      { id: 'nav.about', languageCodes: ['en-US'] },
      { id: 'nav.home', languageCodes: ['en-US', 'nl-NL'] },
    ]);
  });

  it('directory input', async () => {
    const two = await project({ path: 'dir-two' });
    expect(two.header).toContain(at('dir-two'));
    expect(two.files).toEqual([
      { path: at('dir-two', 'shared.eligian'), kind: 'library', exists: true },
    ]);
    expect(two.programs.map(p => p.file)).toEqual([
      at('dir-two', 'one.eligian'),
      at('dir-two', 'two.eligian'),
    ]);
    expect(two.programs[0]!.files).toContainEqual({
      path: at('dir-two', 'shared.eligian'),
      kind: 'library',
      exists: true,
    });

    const libs = await project({ path: 'dir-libs-only' });
    expect(libs.files).toEqual([
      { path: at('dir-libs-only', 'only.eligian'), kind: 'library', exists: true },
    ]);
    expect(libs.programs).toEqual([]);

    const empty = await failure({ path: 'dir-empty' });
    expect(empty._tag).toBe('ToolNotFound');

    // A file input lists its libraries in its own section only
    expect((await project({ path: 'main.eligian' })).files).toEqual([]);
    expect((await failure({ path: 'nope.eligian' }))._tag).toBe('ToolNotFound');
  });

  it('releases every document and writes nothing', async () => {
    const before = fingerprint();
    const count = documentCount();
    await project({ path: 'main.eligian', response_format: 'detailed' });
    await project({ path: 'no-compile/main.eligian' });
    await project({ path: 'dir-two' });
    expect(documentCount()).toBe(count);
    expect(fingerprint()).toEqual(before);
  });

  it('keywords', () => {
    expect(KEYWORDS).toEqual([
      'project',
      'inventory',
      'selectors',
      'css',
      'layout',
      'locales',
      'assets',
    ]);
    for (const keyword of KEYWORDS) expect(DESCRIPTION.slice(0, 200)).toContain(keyword);
    expect(DESCRIPTION).not.toMatch(/explain/);
  });
});
