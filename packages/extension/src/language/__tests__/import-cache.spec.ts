/**
 * Parse cache for imported files (audit low #57)
 */
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { Program } from '@eligian/language';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { ImportParseCache } from '../import-cache.js';
import type { ImportProcessorConfig } from '../import-processor.js';
import { processImports } from '../import-processor.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'eligian-import-cache-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string, content: string, mtimeSeconds?: number): string {
  const file = path.join(dir, name);
  writeFileSync(file, content);
  if (mtimeSeconds !== undefined) {
    utimesSync(file, mtimeSeconds, mtimeSeconds);
  }
  return file;
}

describe('ImportParseCache', () => {
  test('returns the stored metadata while the file is unchanged', () => {
    const file = write('a.css', '.a {}', 1_000_000);
    const cache = new ImportParseCache<string>();
    const stamp = cache.stamp(file);

    cache.set(file, stamp, 'parsed');

    expect(cache.get(file, cache.stamp(file))).toBe('parsed');
  });

  test('misses when the mtime changes', () => {
    const file = write('b.css', '.a {}', 1_000_000);
    const cache = new ImportParseCache<string>();
    cache.set(file, cache.stamp(file), 'parsed');

    utimesSync(file, 2_000_000, 2_000_000);

    expect(cache.get(file, cache.stamp(file))).toBeUndefined();
  });

  test('misses when the size changes even with an identical mtime', () => {
    const file = write('c.css', '.a {}', 1_000_000);
    const cache = new ImportParseCache<string>();
    cache.set(file, cache.stamp(file), 'parsed');

    write('c.css', '.a {} .b {}', 1_000_000);

    expect(cache.get(file, cache.stamp(file))).toBeUndefined();
  });

  test('a missing file has no stamp and is never stored', () => {
    const cache = new ImportParseCache<string>();
    const missing = path.join(dir, 'missing.css');

    expect(cache.stamp(missing)).toBeUndefined();
    cache.set(missing, cache.stamp(missing), 'parsed');

    expect(cache.size).toBe(0);
    expect(cache.get(missing, undefined)).toBeUndefined();
  });

  test('invalidate drops one entry, clear drops all', () => {
    const one = write('d1.css', '.a {}', 1_000_000);
    const two = write('d2.css', '.b {}', 1_000_000);
    const cache = new ImportParseCache<string>();
    cache.set(one, cache.stamp(one), '1');
    cache.set(two, cache.stamp(two), '2');

    cache.invalidate(one);
    expect(cache.get(one, cache.stamp(one))).toBeUndefined();
    expect(cache.get(two, cache.stamp(two))).toBe('2');

    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('processImports with a parse cache', () => {
  const program = {
    $type: 'Program',
    statements: [{ $type: 'DefaultImport', type: 'styles', path: '"./page.css"' }],
  } as unknown as Program;

  function run(cache: ImportParseCache<{ n: number }>, parseFile: ReturnType<typeof vi.fn>) {
    const registry = { updateFile: vi.fn(), registerImports: vi.fn() };
    const config: ImportProcessorConfig<{ n: number }> = {
      importType: 'styles',
      parseFile: parseFile as any,
      createEmptyMetadata: () => ({ n: -1 }),
      registry,
      notification: { type: 'x', createParams: (d, f) => ({ d, f }) },
      cardinality: 'many',
      cache,
    };
    processImports('file:///test/doc.eligian', program, dir, { sendNotification: vi.fn() }, config);
    return registry;
  }

  test('an unchanged file is parsed once across rebuilds, yet the registry is refreshed', () => {
    write('page.css', '.a {}', 1_000_000);
    const parseFile = vi.fn(() => ({ n: 1 }));
    const cache = new ImportParseCache<{ n: number }>();

    const first = run(cache, parseFile);
    const second = run(cache, parseFile);
    const third = run(cache, parseFile);

    expect(parseFile).toHaveBeenCalledTimes(1);
    for (const registry of [first, second, third]) {
      expect(registry.updateFile).toHaveBeenCalledTimes(1);
      expect(registry.updateFile.mock.calls[0][1]).toEqual({ n: 1 });
    }
  });

  test('a changed file is parsed again', () => {
    write('page.css', '.a {}', 1_000_000);
    const parseFile = vi.fn().mockReturnValueOnce({ n: 1 }).mockReturnValueOnce({ n: 2 });
    const cache = new ImportParseCache<{ n: number }>();

    run(cache, parseFile);
    write('page.css', '.a {} .b {}', 2_000_000);
    const registry = run(cache, parseFile);

    expect(parseFile).toHaveBeenCalledTimes(2);
    expect(registry.updateFile.mock.calls[0][1]).toEqual({ n: 2 });
  });

  test('an invalidated entry is parsed again (hot reload)', () => {
    const file = write('page.css', '.a {}', 1_000_000);
    const parseFile = vi.fn(() => ({ n: 1 }));
    const cache = new ImportParseCache<{ n: number }>();

    run(cache, parseFile);
    cache.invalidate(file);
    run(cache, parseFile);

    expect(parseFile).toHaveBeenCalledTimes(2);
  });

  test('a deleted file registers empty metadata and is not served from the cache', () => {
    const file = write('page.css', '.a {}', 1_000_000);
    const parseFile = vi.fn(() => ({ n: 1 }));
    const cache = new ImportParseCache<{ n: number }>();
    run(cache, parseFile);

    rmSync(file);
    const registry = run(cache, parseFile);

    expect(registry.updateFile.mock.calls[0][1]).toEqual({ n: -1 });
  });

  test('a parse failure is not cached', () => {
    write('page.css', '.a {}', 1_000_000);
    const parseFile = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('bad css');
      })
      .mockReturnValueOnce({ n: 7 });
    const cache = new ImportParseCache<{ n: number }>();

    const failed = run(cache, parseFile);
    const recovered = run(cache, parseFile);

    expect(failed.updateFile.mock.calls[0][1]).toEqual({ n: -1 });
    expect(recovered.updateFile.mock.calls[0][1]).toEqual({ n: 7 });
  });
});
