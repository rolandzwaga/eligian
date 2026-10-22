/**
 * Pipeline path handling regression tests (audit 2026-10-22, high findings)
 *
 * 1. parseSource must treat a plain filesystem path (e.g. `C:\\proj\\a.eligian`,
 *    as passed by the CLI and the VS Code extension) as a file path, not as a
 *    URI whose scheme is the drive letter. Otherwise the drive is dropped and
 *    every relative import resolves against the process's current drive.
 * 2. resolveLibraryPath must collapse `..` segments so that library import
 *    cycles routed through `../` are caught by cycle detection instead of
 *    recursing until the process runs out of memory.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { URI } from 'langium';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadLibraryRecursive, resolveLibraryPath } from '../library-loader.js';
import { parseSource, toDocumentUri } from '../parser.js';

const isWindows = process.platform === 'win32';

describe('toDocumentUri', () => {
  it('parses file:// URIs as URIs', () => {
    const uri = toDocumentUri('file:///project/src/main.eligian');
    expect(uri.scheme).toBe('file');
    expect(uri.path).toBe('/project/src/main.eligian');
  });

  it('keeps the drive letter of a Windows path with forward slashes', () => {
    const uri = toDocumentUri('C:/proj/a.eligian');
    expect(uri.scheme).toBe('file');
    expect(uri.path.toLowerCase()).toBe('/c:/proj/a.eligian');
  });

  it.runIf(isWindows)('keeps the drive letter of a Windows path with backslashes', () => {
    const uri = toDocumentUri('C:\\proj\\a.eligian');
    expect(uri.scheme).toBe('file');
    expect(uri.fsPath.toLowerCase()).toBe('c:\\proj\\a.eligian');
  });

  it('treats a POSIX absolute path as a file path', () => {
    const uri = toDocumentUri('/home/user/a.eligian');
    expect(uri.scheme).toBe('file');
    expect(uri.path).toBe('/home/user/a.eligian');
  });
});

describe('resolveLibraryPath normalization', () => {
  it('collapses .. segments', () => {
    const resolved = resolveLibraryPath(
      URI.parse('file:///project/src/main.eligian'),
      '../libs/utils.eligian'
    );
    expect(resolved.path).toBe('/project/libs/utils.eligian');
  });

  it('yields the same URI for a file reached through different .. routes', () => {
    const viaA = resolveLibraryPath(URI.parse('file:///project/a/l1.eligian'), '../b/l2.eligian');
    const viaB = resolveLibraryPath(
      resolveLibraryPath(URI.parse('file:///project/b/l2.eligian'), '../a/l1.eligian'),
      '../b/l2.eligian'
    );
    expect(viaB.toString()).toBe(viaA.toString());
    expect(viaA.path).toBe('/project/b/l2.eligian');
  });

  it('keeps the Windows drive letter and does not climb above the drive root', () => {
    const resolved = resolveLibraryPath(
      URI.file('C:/proj/main.eligian'),
      '../../../libs/utils.eligian'
    );
    expect(resolved.path.toLowerCase()).toBe('/c:/libs/utils.eligian');
  });

  it('accepts backslash separators in the import path', () => {
    const resolved = resolveLibraryPath(
      URI.parse('file:///project/src/main.eligian'),
      '..\\libs\\utils.eligian'
    );
    expect(resolved.path).toBe('/project/libs/utils.eligian');
  });
});

describe('parseSource with real filesystem paths', () => {
  let tempDir: string;

  beforeAll(() => {
    // os.tmpdir() lives on C: on Windows dev machines while the repo (and so
    // the vitest cwd) may be on another drive, which is the failure scenario.
    tempDir = mkdtempSync(path.join(tmpdir(), 'eligian-pipeline-paths-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves styles and library imports relative to an absolute filesystem path', async () => {
    const dir = path.join(tempDir, 'drive-path');
    mkdirSync(path.join(dir, 'lib'), { recursive: true });
    writeFileSync(
      path.join(dir, 's.css'),
      '#app { color: blue; }\n#a { color: green; }\n.box { color: red; }\n'
    );
    writeFileSync(
      path.join(dir, 'lib', 'helpers.eligian'),
      'library helpers\n\naction mark(selector: string) [\n  selectElement(selector)\n  addClass("box")\n]\n'
    );
    const source = [
      'styles "./s.css"',
      'import { mark } from "./lib/helpers.eligian"',
      '',
      'timeline "t" in "#app" using raf {',
      '  at 0s..1s mark("#a")',
      '}',
      '',
    ].join('\n');
    const mainPath = path.join(dir, 'main.eligian');
    writeFileSync(mainPath, source);

    const result = await Effect.runPromise(Effect.result(parseSource(source, mainPath)));

    if (result._tag === 'Failure') {
      throw new Error(`parseSource failed: ${JSON.stringify(result.failure)}`);
    }
    expect(result._tag).toBe('Success');
    expect(result.success.$document?.uri.fsPath.toLowerCase()).toBe(mainPath.toLowerCase());
  });

  it('reports a circular dependency for a ../ based library import cycle', async () => {
    const dir = path.join(tempDir, 'dotdot-cycle');
    mkdirSync(path.join(dir, 'a'), { recursive: true });
    mkdirSync(path.join(dir, 'b'), { recursive: true });
    writeFileSync(
      path.join(dir, 'a', 'l1.eligian'),
      'library l1\n\nimport { actionB } from "../b/l2.eligian"\n\naction actionA(selector: string) [\n  selectElement(selector)\n]\n'
    );
    writeFileSync(
      path.join(dir, 'b', 'l2.eligian'),
      'library l2\n\nimport { actionA } from "../a/l1.eligian"\n\naction actionB(selector: string) [\n  selectElement(selector)\n]\n'
    );

    const l1Uri = URI.file(path.join(dir, 'a', 'l1.eligian'));
    const result = await Effect.runPromise(
      Effect.result(loadLibraryRecursive(l1Uri, URI.file(path.join(dir, 'main.eligian'))))
    );

    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure._tag).toBe('ParseError');
      expect(result.failure.message).toContain('Circular dependency detected');
      // The cycle chain is reported with normalized paths (no '..' segments)
      expect(result.failure.message).not.toContain('..');
    }
  });
});
