/**
 * Spec 058 Phase 1 (FR-015, FR-017, FR-023, SC-006): `eligian_check` over `checkPaths`,
 * one fixture per case. Each diagnostic comes back as an `McpDiagnostic` with its exact
 * `code` and `source`, its suggestions or quick fix, its excerpt, and the overlay of its
 * code (the fix text on the first diagnostic of each code only).
 *
 * The handler is tested directly (tasks.md D2); the wire cases are added by T043. The
 * overlays come from a docs dir generated in `beforeAll` over the fixture curriculum
 * `__fixtures__/mcp/check/curriculum` (one generic overlay per source, one per-code
 * overlay for `unknown_css_class`). The checks run one after the other: they share the
 * Langium services.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCompilerVersion, type QuickFix } from '@eligian/language';
import { Effect } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';
import { makeRecordStore } from '../mcp/brief/known-programs.js';
import { CompilerLockLive } from '../mcp/compiler-lock.js';
import type { McpDiagnostic } from '../mcp/diagnostics.js';
import type { EffectAi } from '../mcp/paths.js';
import {
  DESCRIPTION,
  handle,
  KEYWORDS,
  NAME,
  type Parameters,
  type ToolContext,
} from '../mcp/tools/check.js';
import {
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

/** A declared failure on the wire (FR-005, FR-006): its `error`, after the shape checks. */
const expectFailure = (result: ToolCallResult, kind: string) => {
  const raw = result.raw as { content: { type: string; text: string }[] };
  const text = raw.content[0].text;
  expect(result.isError).toBe(true);
  expect(text.startsWith('{"header":')).toBe(true);
  expect(JSON.parse(text).error.kind).toBe(kind);
  expect(raw).not.toHaveProperty('structuredContent');
  return result.payload.error as { kind: string; message: string; path?: string };
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.join(HERE, '__fixtures__', 'mcp', 'check');
const CURRICULUM = path.join(CASES, 'curriculum');
/**
 * The case directories, each holding a `main.eligian`; not `.eligian/`, the program record a
 * server started on this dir writes (spec 059 FR-058)
 */
const CASE_NAMES = fs
  .readdirSync(CASES, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name !== 'curriculum' && entry.name !== '.eligian')
  .map(entry => entry.name)
  .sort();

type Params = typeof Parameters.Type;

const tempDirs: string[] = [];
const tempDir = (prefix: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** The text with the 1-based range of `fix` replaced by its `newText`. */
const applyQuickFix = (text: string, fix: QuickFix): string => {
  const lines = text.split('\n');
  const offset = (line: number, column: number): number =>
    lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0) + column - 1;
  return (
    text.slice(0, offset(fix.line, fix.column)) +
    fix.newText +
    text.slice(offset(fix.endLine, fix.endColumn))
  );
};

/** The names of a message's "Did you mean: …?" part (quotes stripped). */
const namesInMessage = (message: string): string[] =>
  (/Did you mean: ([^?]+)\?/.exec(message)?.[1] ?? '')
    .split(', ')
    .map(name => name.replace(/^'(.*)'$/, '$1'))
    .filter(name => name !== '');

describe('eligian_check', () => {
  let ai: EffectAi;
  let docsRoot: string;
  let stateDir: string;
  const versions = getCompilerVersion();

  beforeAll(async () => {
    ai = await import('effect/ai');
    docsRoot = tempDir('eligian-check-docs-');
    stateDir = tempDir('eligian-check-state-');
    await generateKnowledge({ outDir: docsRoot, curriculumDir: CURRICULUM });
  }, 120_000);

  const context = (cwd: string): ToolContext => ({
    ai,
    cwd,
    docsRoot,
    versions,
    requestId: '1',
    // Spec 059 FR-058 move (1): a case's programs exist before the first call scans its dir.
    gate: { record: makeRecordStore(), stateDir, noteBrief: () => {} },
  });

  const check = (cwd: string, params: Params = { paths: ['main.eligian'] }) =>
    Effect.runPromise(handle(params, context(cwd)).pipe(Effect.provide(CompilerLockLive)));

  const checkCase = (name: string, params?: Params) => check(path.join(CASES, name), params);

  /** The only diagnostic of `code`. */
  const only = (diagnostics: readonly McpDiagnostic[], code: string): McpDiagnostic => {
    const found = diagnostics.filter(d => d.code === code);
    expect(found).toHaveLength(1);
    return found[0]!;
  };

  /** Checks a copy of the case, applies the quick fix of `code` and checks again. */
  const quickFixClears = async (name: string, code: string): Promise<void> => {
    const dir = tempDir(`eligian-check-${name}-`);
    fs.cpSync(path.join(CASES, name), dir, { recursive: true });
    const before = await check(dir);
    const diagnostic = only(before.diagnostics, code);
    expect(diagnostic.source).toBe('validator');
    expect(diagnostic.quickFix?.newText).toContain('selectElement(');

    const file = path.join(dir, 'main.eligian');
    fs.writeFileSync(file, applyQuickFix(fs.readFileSync(file, 'utf8'), diagnostic.quickFix!));
    const after = await check(dir);
    expect(after.diagnostics.map(d => d.code)).not.toContain(code);
  };

  it('missing-dependency has a selectElement quick fix', async () => {
    await quickFixClears('missing-dependency', 'missing-dependency');
  });

  it('missing-action-dependency has a selectElement quick fix', async () => {
    await quickFixClears('missing-action-dependency', 'missing-action-dependency');
  });

  it('unknown_operation suggestions', async () => {
    const { diagnostics } = await checkCase('unknown-operation');
    const diagnostic = only(diagnostics, 'unknown_operation');
    expect(diagnostic.source).toBe('validator');
    expect(diagnostic.suggestions).toContain('addClass');
  });

  it.each([
    ['unknown-css-class', 'unknown_css_class'],
    ['unknown-css-class-in-selector', 'unknown_css_class_in_selector'],
    ['unknown-css-id-in-selector', 'unknown_css_id_in_selector'],
  ])('unknown_css_class suggestions equal the message list (%s)', async (name, code) => {
    const { diagnostics } = await checkCase(name);
    const diagnostic = only(diagnostics, code);
    expect(diagnostic.source).toBe('validator');
    expect(diagnostic.suggestions?.length).toBeGreaterThan(0);
    expect(diagnostic.suggestions).toEqual(namesInMessage(diagnostic.message));
  });

  it('unknown_dom_event suggestions', async () => {
    const { diagnostics } = await checkCase('unknown-dom-event');
    const diagnostic = only(diagnostics, 'unknown_dom_event');
    expect(diagnostic.source).toBe('validator');
    expect(diagnostic.suggestions).toContain('click');
  });

  it('eligius-<rule> has source eligius-lint', async () => {
    const { diagnostics } = await checkCase('eligius-lint');
    const diagnostic = only(diagnostics, 'eligius-E120');
    expect(diagnostic.source).toBe('eligius-lint');
    expect(diagnostic.severity).toBe('error');
  });

  it('controller-imbalance and class-never-removed have source review', async () => {
    const imbalance = only(
      (await checkCase('controller-imbalance')).diagnostics,
      'controller-imbalance'
    );
    expect(imbalance.source).toBe('review');
    expect(imbalance.quickFix?.newText).toContain('removeControllerFromElement(');

    const neverRemoved = only(
      (await checkCase('class-never-removed')).diagnostics,
      'class-never-removed'
    );
    expect(neverRemoved.source).toBe('review');
  });

  it('warnings only: ok false at 0, true at maxWarnings 10', async () => {
    const strict = await checkCase('warnings-only');
    expect(strict.diagnostics.length).toBeGreaterThan(0);
    expect(strict.diagnostics.every(d => d.severity === 'warning')).toBe(true);
    expect(strict.ok).toBe(false);

    const lenient = await checkCase('warnings-only', { paths: ['main.eligian'], maxWarnings: 10 });
    expect(lenient.ok).toBe(true);
    expect(lenient.diagnostics).toEqual(strict.diagnostics);
  });

  it('nonexistent path is ToolNotFound', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        handle({ paths: ['missing.eligian'] }, context(path.join(CASES, 'warnings-only')))
      ).pipe(Effect.provide(CompilerLockLive))
    );
    expect(error._tag).toBe('ToolNotFound');
    expect(error.message).toContain('missing.eligian');
  });

  it('every diagnostic has an excerpt and an absolute file', async () => {
    const seen: McpDiagnostic[] = [];
    for (const name of CASE_NAMES) seen.push(...(await checkCase(name)).diagnostics);
    expect(seen.length).toBeGreaterThanOrEqual(CASE_NAMES.length);
    for (const diagnostic of seen) {
      expect(path.isAbsolute(diagnostic.file)).toBe(true);
      expect(fs.existsSync(diagnostic.file)).toBe(true);
      expect(diagnostic.excerpt.trim()).not.toBe('');
      expect(diagnostic.docs).toBeDefined();
    }
  });

  it('fix only on the first of each code', async () => {
    const { diagnostics } = await checkCase('repeated-code');
    expect(diagnostics.map(d => d.code)).toEqual(['unknown_css_class', 'unknown_css_class']);
    const [first, second] = diagnostics;
    expect(first!.docs).toBe('diagnostic/unknown_css_class');
    expect(first!.fix).toMatch(/not in the imported CSS/);
    expect(second!.docs).toBe('diagnostic/unknown_css_class');
    expect(second).not.toHaveProperty('fix');

    // A code without an overlay of its own gets its source's generic one
    const { diagnostics: review } = await checkCase('class-never-removed');
    expect(only(review, 'class-never-removed')).toMatchObject({
      docs: 'diagnostic/source-review',
      fix: expect.stringContaining('generic review overlay'),
    });
  });

  it('summary and files', async () => {
    const dir = path.join(CASES, 'class-never-removed');
    const file = path.join(dir, 'main.eligian');
    const payload = await check(dir);
    expect(Object.keys(payload)[0]).toBe('header');
    expect(payload.header).toBe(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${file}`
    );
    expect(payload.root).toBe(dir);
    expect(payload.files).toEqual([{ file, errors: 0, warnings: 1 }]);
    expect(payload.summary).toBe('1 file: 0 errors, 1 warning (max 0)');
    expect(payload.ok).toBe(false);

    const both = await check(CASES, {
      paths: ['class-never-removed/main.eligian', 'unknown-operation/main.eligian'],
      maxWarnings: 3,
    });
    expect(both.header).toBe(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${CASES}`
    );
    expect(both.files.map(f => [path.relative(CASES, f.file), f.errors, f.warnings])).toEqual([
      [path.join('class-never-removed', 'main.eligian'), 0, 1],
      [path.join('unknown-operation', 'main.eligian'), 1, 0],
    ]);
    expect(both.summary).toBe('2 files: 1 error, 1 warning (max 3)');
    expect(both.ok).toBe(false);
  });

  it('description: at most 1,000 chars, keywords up front, stricter defaults', () => {
    expect(NAME).toBe('eligian_check');
    expect(DESCRIPTION.length).toBeLessThanOrEqual(1000);
    expect(DESCRIPTION).toMatch(/stricter than the CLI/);
    for (const keyword of KEYWORDS) {
      expect(DESCRIPTION.slice(0, 200).toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  describe('eligian_check on the wire', () => {
    const servers: InMemoryServer[] = [];

    const start = async (cwd: string): Promise<InMemoryServer> => {
      const server = await startInMemoryServer({ cwd, docsRoot });
      servers.push(server);
      return server;
    };

    afterEach(async () => {
      for (const server of servers.splice(0)) await server.close();
    });

    it('nonexistent path is kind not-found', async () => {
      const server = await start(path.join(CASES, 'warnings-only'));

      const error = expectFailure(
        await server.callTool(NAME, { paths: ['missing.eligian'] }),
        'not-found'
      );

      expect(error.message).toContain('missing.eligian');
    });

    it('a path outside the root is kind not-found', async () => {
      const server = await start(path.join(CASES, 'warnings-only'));
      // an existing program, so the refusal is the root's
      const outside = path.join(CASES, 'unknown-operation', 'main.eligian');

      const error = expectFailure(await server.callTool(NAME, { paths: [outside] }), 'not-found');

      expect(error.message).toContain('outside the project root');
    });

    it('a success payload deep-equals structuredContent', async () => {
      const dir = path.join(CASES, 'unknown-operation');
      const server = await start(dir);

      const { payload, isError, raw } = await server.callTool(NAME, { paths: ['main.eligian'] });
      const result = raw as {
        content: { type: string; text: string }[];
        structuredContent?: unknown;
      };

      expect(isError).toBe(false);
      expect(result.content[0].text.startsWith('{"header":')).toBe(true);
      expect(result.structuredContent).toBeDefined();
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
      expect(payload.diagnostics.map((d: McpDiagnostic) => d.code)).toContain('unknown_operation');
      expect(payload.header).toBe(
        `eligian ${versions.compiler} · eligius ${versions.eligius} · ${NAME} · ${path.join(dir, 'main.eligian')}`
      );
    });
  });
});
