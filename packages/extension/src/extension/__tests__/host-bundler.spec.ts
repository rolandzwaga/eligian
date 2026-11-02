/**
 * The preview's host-module bundler (audit idea #24): esbuild-wasm in a
 * worker thread. Runs the built worker (`out/`), so it is skipped before the
 * extension was built (CI builds first).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HostBundler } from '../preview/host-bundler.js';

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const built =
  fs.existsSync(path.join(extensionPath, 'out', 'esbuild.wasm')) &&
  fs.existsSync(path.join(extensionPath, 'out', 'extension', 'preview', 'host-bundler-worker.cjs'));

describe.skipIf(!built)('HostBundler', () => {
  let dir: string;
  let bundler: HostBundler;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-host-bundler-'));
    fs.mkdirSync(path.join(dir, 'lib'));
    // An npm package, resolved from the importing file
    fs.mkdirSync(path.join(dir, 'node_modules', 'tiny-currency'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'node_modules', 'tiny-currency', 'package.json'),
      JSON.stringify({ name: 'tiny-currency', main: 'index.js' })
    );
    fs.writeFileSync(
      path.join(dir, 'node_modules', 'tiny-currency', 'index.js'),
      "exports.euro = n => 'EUR ' + n;\n"
    );
    fs.writeFileSync(
      path.join(dir, 'lib', 'format.ts'),
      'export const twoDecimals = (n: number): string => n.toFixed(2);\n'
    );
    fs.writeFileSync(
      path.join(dir, 'host.ts'),
      `import { twoDecimals } from './lib/format';
import { euro } from 'tiny-currency';
interface Data { eventName: string }
export const operations = { trackEvent(data: Data) { return data; } };
export const functions = { formatPrice: (n: number) => euro(twoDecimals(n)) };
`
    );
    fs.writeFileSync(path.join(dir, 'broken.ts'), 'export const operations = { a( { } };\n');
    bundler = new HostBundler(extensionPath, path.join(dir, 'out'));
  });

  afterAll(() => {
    bundler.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('bundles TypeScript with its relative imports into a content-addressed file', async () => {
    const first = await bundler.bundle(path.join(dir, 'host.ts'));
    expect(first).toEqual({ file: expect.any(String) });
    const file = (first as { file: string }).file;
    const code = fs.readFileSync(file, 'utf-8');
    expect(code).toContain('trackEvent');
    expect(code).toContain('toFixed(2)');
    expect(code).toContain('EUR ');
    expect(code).not.toContain('interface Data');
    // Same code, same file
    expect(await bundler.bundle(path.join(dir, 'host.ts'))).toEqual({ file });
  }, 30000);

  it('reports a syntax error with its file and line', async () => {
    const result = await bundler.bundle(path.join(dir, 'broken.ts'));
    expect(result).toEqual({
      errors: [expect.stringMatching(/broken\.ts:1: Expected "\)" but found "\}"/)],
    });
  }, 30000);
});
