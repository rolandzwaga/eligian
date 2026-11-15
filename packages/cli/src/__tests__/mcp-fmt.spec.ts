/**
 * Spec 058 Phase 1 (FR-024, SC-009; plan C9): the `eligian_fmt` tool. The handler is tested
 * directly (D2); the fixtures are copied to a temp dir per test, which is the project root.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getCompilerVersion } from '@eligian/language';
import { Effect } from 'effect';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CompilerLockLive } from '../mcp/compiler-lock.js';
import type { EffectAi } from '../mcp/paths.js';
import { DESCRIPTION, handle, KEYWORDS, NAME, type ToolContext } from '../mcp/tools/fmt.js';
import {
  type InMemoryServer,
  startInMemoryServer,
  type ToolCallResult,
} from './mcp-test-client.js';

const FIXTURES = path.join(__dirname, '__fixtures__', 'mcp', 'fmt');
const versions = getCompilerVersion();

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

const hash = (file: string): string =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('eligian_fmt', () => {
  let ai: EffectAi;
  let dir: string;
  let context: ToolContext;

  const run = (params: Parameters<typeof handle>[0]) =>
    Effect.runPromise(handle(params, context).pipe(Effect.provide(CompilerLockLive)));
  const failure = (params: Parameters<typeof handle>[0]) =>
    Effect.runPromise(handle(params, context).pipe(Effect.flip, Effect.provide(CompilerLockLive)));

  beforeAll(async () => {
    ai = await import('effect/ai');
  });

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-fmt-')));
    for (const name of fs.readdirSync(FIXTURES)) {
      fs.copyFileSync(path.join(FIXTURES, name), path.join(dir, name));
    }
    context = { ai, cwd: dir, docsRoot: dir, versions, requestId: '1' };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('names its keywords in the first 200 chars of the description', () => {
    expect(NAME).toBe('eligian_fmt');
    for (const keyword of KEYWORDS) {
      expect(DESCRIPTION.slice(0, 200).toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  it('check mode leaves the bytes', async () => {
    const file = path.join(dir, 'unformatted.eligian');
    const before = hash(file);

    const result = await run({ paths: ['unformatted.eligian'] });

    expect(result.header).toBe(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · eligian_fmt · ${file}`
    );
    expect(result.written).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].file).toBe(file);
    expect(result.files[0].formatted).toBe(false);
    expect(result.files[0].lineDiff).toContain('- selectElement( sel )');
    expect(result.files[0].lineDiff).toContain('+   selectElement(sel)');
    expect(result.files[0].error).toBeUndefined();
    expect(hash(file)).toBe(before);
  });

  it('write, then formatted', async () => {
    const file = path.join(dir, 'unformatted.eligian');

    const written = await run({ paths: ['unformatted.eligian'], write: true });

    expect(written.written).toEqual([file]);
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      fs.readFileSync(path.join(FIXTURES, 'formatted.eligian'), 'utf-8')
    );
    const checked = await run({ paths: ['unformatted.eligian'] });
    expect(checked.files).toEqual([{ file, formatted: true }]);
    expect(checked.written).toEqual([]);
  });

  it('an already formatted file is not in written', async () => {
    const result = await run({ paths: ['formatted.eligian'], write: true });

    expect(result.files).toEqual([{ file: path.join(dir, 'formatted.eligian'), formatted: true }]);
    expect(result.written).toEqual([]);
  });

  it('syntax error reported, file untouched', async () => {
    const file = path.join(dir, 'syntax-error.eligian');
    const before = hash(file);

    const result = await run({ paths: ['syntax-error.eligian'], write: true });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].file).toBe(file);
    expect(result.files[0].formatted).toBe(false);
    expect(result.files[0].error).toEqual(expect.any(String));
    expect(result.written).toEqual([]);
    expect(hash(file)).toBe(before);
  });

  it('several files: the header names the project root', async () => {
    const result = await run({ paths: ['.'] });

    expect(result.header).toBe(
      `eligian ${versions.compiler} · eligius ${versions.eligius} · eligian_fmt · ${dir}`
    );
    expect(result.files.map(f => path.basename(f.file))).toEqual([
      'formatted.eligian',
      'syntax-error.eligian',
      'unformatted.eligian',
    ]);
  });

  it('a path outside the root is ToolNotFound', async () => {
    const error = await failure({ paths: ['../elsewhere.eligian'] });

    expect(error._tag).toBe('ToolNotFound');
  });

  it('a failed write is ToolIoError with the path', async () => {
    const file = path.join(dir, 'unformatted.eligian');
    fs.chmodSync(file, 0o444);
    try {
      const error = await failure({ paths: ['unformatted.eligian'], write: true });

      expect(error._tag).toBe('ToolIoError');
      expect(error.path).toBe(file);
    } finally {
      fs.chmodSync(file, 0o666);
    }
  });

  describe('eligian_fmt on the wire', () => {
    let server: InMemoryServer | undefined;

    afterEach(async () => {
      await server?.close();
      server = undefined;
    });

    it('a failed write is kind io with the path', async () => {
      const file = path.join(dir, 'unformatted.eligian');
      fs.chmodSync(file, 0o444);
      try {
        server = await startInMemoryServer({ cwd: dir, docsRoot: dir });

        const error = expectFailure(
          await server.callTool(NAME, { paths: ['unformatted.eligian'], write: true }),
          'io'
        );

        expect(error.path).toBe(file);
      } finally {
        fs.chmodSync(file, 0o666);
      }
    });
  });
});
