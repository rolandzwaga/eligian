/**
 * `fmtFiles`: the object-returning core of `eligian fmt` (spec 058, FR-024).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fmtFiles, lineDiff } from '../fmt.js';

const MESSY = 'action a(sel) [\nselectElement( sel )\n]\n';
const FORMATTED = 'action a(sel) [\n  selectElement(sel)\n]\n';
const BROKEN = 'action a( [';

describe('fmtFiles', () => {
  let dir: string;
  let messy: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-fmt-files-'));
    messy = path.join(dir, 'messy.eligian');
    fs.writeFileSync(messy, MESSY);
  });

  afterEach(() => {
    fs.chmodSync(messy, 0o666);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('check mode reports and does not write', async () => {
    const [result] = await fmtFiles([messy], { write: false });

    expect(result.file).toBe(messy);
    expect(result.formatted).toBe(false);
    expect(result.written).toBeUndefined();
    expect(result.lineDiff).toBe(lineDiff(MESSY, FORMATTED));
    expect(result.firstDifference).toBe(2);
    expect(result.error).toBeUndefined();
    expect(fs.readFileSync(messy, 'utf-8')).toBe(MESSY);
  });

  it('write mode rewrites and sets written', async () => {
    const [result] = await fmtFiles([messy], { write: true });

    expect(result).toEqual({ file: messy, formatted: true, written: true });
    expect(fs.readFileSync(messy, 'utf-8')).toBe(FORMATTED);

    const [checked] = await fmtFiles([messy], { write: false });
    expect(checked).toEqual({ file: messy, formatted: true });
  });

  it('syntax error: error set, file untouched', async () => {
    const broken = path.join(dir, 'broken.eligian');
    fs.writeFileSync(broken, BROKEN);

    const [result] = await fmtFiles([broken], { write: true });

    expect(result.file).toBe(broken);
    expect(result.formatted).toBe(false);
    expect(result.written).toBeUndefined();
    expect(result.error).toEqual(expect.any(String));
    expect(result.error).not.toBe('');
    expect(fs.readFileSync(broken, 'utf-8')).toBe(BROKEN);
  });

  it('a failed write rejects with the fs error', async () => {
    fs.chmodSync(messy, 0o444);

    const error: NodeJS.ErrnoException = await fmtFiles([messy], { write: true }).then(
      () => {
        throw new Error('expected fmtFiles to reject');
      },
      (e: NodeJS.ErrnoException) => e
    );

    expect(['EACCES', 'EPERM']).toContain(error.code);
    expect(error.path).toBe(messy);
  });
});
