/**
 * checkFiles (`eligian check`): every diagnostic of every file, with severity,
 * where compile() stops at the first error.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { getOrCreateServices } from '../pipeline/services.js';
import { checkFiles } from '../pipeline.js';

describe('checkFiles', () => {
  let dir: string;
  const write = (name: string, content: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    return file;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-check-'));
    write('s.css', '.c {} .on {} #a {}');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const check = (...files: string[]) => Effect.runPromise(checkFiles(files));

  test('reports every error in a file, not only the first, with 1-based positions', async () => {
    const file = write(
      'many.eligian',
      `styles "./s.css"
action a() [ selectElement("#a") addClass("nope") ]
action b() [ selectElement("#a") addClass("missing") ]
timeline "t" in ".c" using raf { at 0s..1s a() at 1s..2s b() }
`
    );

    const [result] = await check(file);

    expect(result.file).toBe(file);
    const errors = result.diagnostics.filter(d => d.severity === 'error');
    expect(errors.map(e => [e.line, e.message.slice(0, 22)])).toEqual([
      [2, "Unknown CSS class: 'no"],
      [3, "Unknown CSS class: 'mi"],
    ]);
    expect(errors[0].column).toBe(43);
    expect(errors[0].endColumn).toBe(49);
  });

  test('keeps warnings separate from errors, and a clean program has none', async () => {
    const clean = write(
      'clean.eligian',
      `styles "./s.css"
timeline "t" in ".c" using raf { at 0s..1s [ selectElement("#a") addClass("on") ] [] }
`
    );
    const warned = write('warned.eligian', `styles "./s.css"\ntimeline "t" in ".c" using raf {}\n`);

    const [cleanResult, warnedResult] = await check(clean, warned);

    expect(cleanResult.diagnostics).toEqual([]);
    expect(warnedResult.diagnostics.map(d => d.severity)).toEqual(['warning']);
    expect(warnedResult.diagnostics[0].message).toContain('Timeline has no events');
  });

  test('links imports of libraries that are not in the checked set, and checks library files', async () => {
    const lib = write('lib.eligian', 'library lib\n\naction highlight() [ addClass("on") ]\n');
    const main = write(
      'main.eligian',
      `styles "./s.css"
import { highlight } from "./lib.eligian"
timeline "t" in ".c" using raf { at 0s..1s highlight() }
`
    );

    const [mainOnly] = await check(main);
    const [libResult, mainResult] = await check(lib, main);

    // The import resolves, so the dataflow contract is checked at the call site
    expect(mainOnly.diagnostics.map(d => d.code)).toEqual(['missing-action-dependency']);
    expect(mainOnly.diagnostics[0].line).toBe(3);
    expect(mainResult.diagnostics).toEqual(mainOnly.diagnostics);
    expect(libResult.diagnostics).toEqual([]);
  });

  test('reports parse errors and unreadable files as errors of that file', async () => {
    const broken = write('broken.eligian', 'timeline "t" in ".c" using raf { at 0s..1s [ \n');
    const missing = path.join(dir, 'missing.eligian');

    const [brokenResult, missingResult] = await check(broken, missing);

    expect(brokenResult.diagnostics.some(d => d.severity === 'error')).toBe(true);
    expect(missingResult.diagnostics).toHaveLength(1);
    expect(missingResult.diagnostics[0].message).toMatch(/^Cannot read file: /);
  });

  test('leaves no documents behind in the shared compiler workspace', async () => {
    const file = write('one.eligian', `styles "./s.css"\ntimeline "t" in ".c" using raf {}\n`);
    const documents = getOrCreateServices().shared.workspace.LangiumDocuments;
    const before = documents.all.count();

    await check(file);

    expect(documents.all.count()).toBe(before);
  });
});
