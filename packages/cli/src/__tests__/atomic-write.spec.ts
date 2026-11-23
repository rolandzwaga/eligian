/**
 * `writeFileAtomic` (spec 059 FR-034, plan P6): a temp file in the target's directory, then a
 * rename onto the target; a `beforeRename` seam that can abort the write; the temp file never
 * outlives the call.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileAtomic } from '../atomic-write.js';

/** Pass-through `node:fs/promises` whose `rename` a test can make fail (the retry path). */
const renameHook = vi.hoisted(() => ({
  failures: [] as string[],
  calls: 0,
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      renameHook.calls++;
      const code = renameHook.failures.shift();
      if (code !== undefined) {
        throw Object.assign(new Error(`${code}: rename`), { code });
      }
      return actual.rename(from, to);
    },
  };
});

describe('writeFileAtomic', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-atomic-write-'));
    renameHook.failures = [];
    renameHook.calls = 0;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const temps = (): string[] => fs.readdirSync(dir).filter(f => f.endsWith('.tmp'));

  it('writes the text and leaves no *.tmp', async () => {
    const target = path.join(dir, 'BRIEF.md');
    const result = await writeFileAtomic(target, '# Brief\n');
    expect(result).toBe('written');
    expect(fs.readFileSync(target, 'utf8')).toBe('# Brief\n');
    expect(temps()).toEqual([]);
  });

  it('replaces an existing target', async () => {
    const target = path.join(dir, 'BRIEF.md');
    fs.writeFileSync(target, 'OLD', 'utf8');
    const result = await writeFileAtomic(target, 'NEW');
    expect(result).toBe('written');
    expect(fs.readFileSync(target, 'utf8')).toBe('NEW');
    expect(temps()).toEqual([]);
  });

  it('beforeRename false returns aborted, leaves the target untouched and removes the temp', async () => {
    const target = path.join(dir, 'BRIEF.md');
    fs.writeFileSync(target, 'OLD', 'utf8');
    const result = await writeFileAtomic(target, 'NEW', { beforeRename: async () => false });
    expect(result).toBe('aborted');
    expect(fs.readFileSync(target, 'utf8')).toBe('OLD');
    expect(temps()).toEqual([]);
  });

  it('a beforeRename that rejects rejects with that error, leaves the target untouched and no *.tmp', async () => {
    const target = path.join(dir, 'BRIEF.md');
    fs.writeFileSync(target, 'OLD', 'utf8');
    const err = new Error('seam failed');
    await expect(
      writeFileAtomic(target, 'x', {
        beforeRename: async () => {
          throw err;
        },
      })
    ).rejects.toBe(err);
    expect(fs.readFileSync(target, 'utf8')).toBe('OLD');
    expect(temps()).toEqual([]);
  });

  it('names the temp .BRIEF.<pid>.<n>.tmp in the target dir', async () => {
    const target = path.join(dir, 'BRIEF.md');
    const pattern = new RegExp(`^\\.BRIEF\\.${process.pid}\\.\\d+\\.tmp$`);
    let seen: string[] = [];
    const result = await writeFileAtomic(target, 'x', {
      beforeRename: async () => {
        seen = fs.readdirSync(dir).filter(f => pattern.test(f));
        return true;
      },
    });
    expect(result).toBe('written');
    expect(seen).toHaveLength(1);
    expect(temps()).toEqual([]);
  });

  it('retries a rename that fails with EPERM, EBUSY or EACCES, then writes', async () => {
    const target = path.join(dir, 'BRIEF.md');
    fs.writeFileSync(target, 'OLD', 'utf8');
    renameHook.failures = ['EPERM', 'EBUSY', 'EACCES'];
    const result = await writeFileAtomic(target, 'NEW');
    expect(result).toBe('written');
    expect(renameHook.calls).toBe(4);
    expect(fs.readFileSync(target, 'utf8')).toBe('NEW');
    expect(temps()).toEqual([]);
  });

  it('a rename error that is not retryable rejects at once, target untouched, no *.tmp', async () => {
    const target = path.join(dir, 'BRIEF.md');
    fs.writeFileSync(target, 'OLD', 'utf8');
    renameHook.failures = ['ENOSPC'];
    await expect(writeFileAtomic(target, 'NEW')).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(renameHook.calls).toBe(1);
    expect(fs.readFileSync(target, 'utf8')).toBe('OLD');
    expect(temps()).toEqual([]);
  });
});
