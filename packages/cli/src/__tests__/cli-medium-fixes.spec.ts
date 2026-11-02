/**
 * Regression tests for the CLI medium audit findings (2026-10-22):
 *  - #37 default output path must never equal the input path
 *  - #38 runtime dependencies must be declared in the CLI package.json
 *  - #40 bundle mode must preserve compile error details (line/snippet/hint)
 *
 * The CLI binary tests require built dist output (same as cli.spec.ts).
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Cause, Effect, Exit, Option } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BundleCompileError, createBundle } from '../bundler/index.js';
import { CompileError, ParseError } from '../compile-file.js';
import { deriveDefaultOutputPath, isSamePath } from '../output-path.js';

const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const FIXTURES = path.join(__dirname, '__fixtures__');
const VALID_SOURCE = `styles "./t.css"

endable action show [
  selectElement("#slide1")
  addClass("visible")
] [
  selectElement("#slide1")
  removeClass("visible")
]

timeline "t" in "#app" using raf {
  at 0s..5s show()
}
`;

/** Write a valid program (plus the stylesheet it imports) to `file` */
function writeValid(file: string): void {
  fs.writeFileSync(file, VALID_SOURCE);
  const css = '#app { color: red; }\n#slide1 { color: blue; }\n.visible { color: green; }\n';
  fs.writeFileSync(path.join(path.dirname(file), 't.css'), css);
}

const INVALID_SYNTAX_FIXTURE = path.join(FIXTURES, 'invalid-syntax.eligian');

describe('deriveDefaultOutputPath (#37)', () => {
  it('replaces a lowercase .eligian extension', () => {
    expect(deriveDefaultOutputPath('a/b.eligian', '.json')).toBe('a/b.json');
    expect(deriveDefaultOutputPath('a/b.eligian', '.bundle')).toBe('a/b.bundle');
  });

  it('replaces the extension case-insensitively', () => {
    expect(deriveDefaultOutputPath('Foo.ELIGIAN', '.json')).toBe('Foo.json');
  });

  it('appends the extension when the input has no .eligian extension', () => {
    expect(deriveDefaultOutputPath('foo.txt', '.json')).toBe('foo.txt.json');
    expect(deriveDefaultOutputPath('foo', '.json')).toBe('foo.json');
    expect(deriveDefaultOutputPath('x.json', '.json')).toBe('x.json.json');
  });

  it('never returns the input path', () => {
    for (const input of ['a.eligian', 'A.Eligian', 'a.json', 'a', 'a.eli']) {
      expect(deriveDefaultOutputPath(input, '.json')).not.toBe(input);
    }
  });
});

describe('isSamePath (#37)', () => {
  it('detects identical and equivalent paths', () => {
    expect(isSamePath('a.json', 'a.json')).toBe(true);
    expect(isSamePath('./a.json', 'a.json')).toBe(true);
  });

  it('treats stdout and different files as distinct', () => {
    expect(isSamePath('a.json', '-')).toBe(false);
    expect(isSamePath('a.json', 'b.json')).toBe(false);
  });
});

describe('CLI binary - source is never overwritten (#37)', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'eligian-cli-out-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpdir, { recursive: true, force: true }).catch(() => {});
  });

  it.each(['story.txt', 'Story.ELIGIAN', 'story'])('never overwrites the source file %s', name => {
    const source = path.join(tmpdir, name);
    writeValid(source);
    const original = fs.readFileSync(source, 'utf-8');

    spawnSync('node', [CLI_PATH, source], { encoding: 'utf-8' });

    // Regardless of whether the language service accepts the extension, the
    // default output path must not clobber the input.
    expect(fs.readFileSync(source, 'utf-8')).toBe(original);
  });

  it('refuses an explicit --output equal to the input file', () => {
    const source = path.join(tmpdir, 'story.eligian');
    writeValid(source);
    const original = fs.readFileSync(source, 'utf-8');

    const run = spawnSync('node', [CLI_PATH, source, '-o', source], { encoding: 'utf-8' });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('refusing to overwrite');
    expect(fs.readFileSync(source, 'utf-8')).toBe(original);
  });
});

describe('CLI package.json declares runtime dependencies (#38)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')) as {
    dependencies: Record<string, string>;
  };

  it.each(['esbuild', 'eligius', 'jquery', 'effect'])('declares %s', dep => {
    expect(pkg.dependencies[dep]).toBeTruthy();
  });
});

describe('bundle mode preserves compile error details (#40)', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'eligian-bundle-err-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpdir, { recursive: true, force: true }).catch(() => {});
  });

  it('createBundle fails with a BundleCompileError wrapping the typed compile error', async () => {
    const exit = await Effect.runPromiseExit(
      createBundle(INVALID_SYNTAX_FIXTURE, { outputDir: path.join(tmpdir, 'out'), force: true })
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    const failure = Cause.findErrorOption(exit.cause);
    expect(Option.isSome(failure)).toBe(true);
    if (!Option.isSome(failure)) return;
    expect(failure.value).toBeInstanceOf(BundleCompileError);
    const wrapped = (failure.value as BundleCompileError).compileError;
    expect(wrapped).toBeInstanceOf(CompileError);
    expect(wrapped.constructor).not.toBe(Error);
    // Details (formatted list with message, snippet/hint) survive
    expect(wrapped.details).toBeDefined();
    if (wrapped instanceof ParseError) {
      expect(wrapped.formatted.length).toBeGreaterThan(0);
    }
  });

  it('CLI --bundle prints the same detailed output as a plain compile', () => {
    const plain = spawnSync('node', [CLI_PATH, INVALID_SYNTAX_FIXTURE, '-o', '-'], {
      encoding: 'utf-8',
    });
    const bundle = spawnSync(
      'node',
      [CLI_PATH, INVALID_SYNTAX_FIXTURE, '--bundle', '-o', path.join(tmpdir, 'b'), '--force'],
      { encoding: 'utf-8' }
    );

    expect(plain.status).toBe(1);
    expect(bundle.status).toBe(1);
    // Not flattened to the "Compilation failed: ParseError: ..." single line
    expect(bundle.stderr).not.toMatch(/Compilation failed: \w*Error:/);
    expect(bundle.stderr).not.toContain('Bundle failed:');
    expect(bundle.stderr).toBe(plain.stderr);
  });
});
