/**
 * Host modules in the CLI (audit idea #24): `--bundle` imports the extensions
 * module and registers the declared names; `eligian smoke` runs its code.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBundle } from '../bundler/index.js';
import { generateEntryPoint } from '../bundler/runtime-bundler.js';
import { compileFile } from '../compile-file.js';
import { registrationsOf } from '../dev/host-module.js';
import { runSmoke } from '../smoke/smoke-command.js';

const HOST = `export const operations = {
  trackEvent(operationData: { eventName: string }) {
    if (operationData.eventName === 'boom') throw new Error('tracking failed');
    return operationData;
  },
};
export const functions = { formatPrice: (value: number) => value.toFixed(2) };
export class Confetti {
  name = 'Confetti';
  init() {}
  attach() {}
  detach() {}
}
export const controllers = { Confetti };
`;

const program = (event: string) => `layout "./layout.html"
styles "./styles.css"
extensions "./host.ts" {
  operation trackEvent(eventName: string)
  controller Confetti()
  function formatPrice
}
timeline "t" in "#stage" using raf {
  at 0s..1s [ trackEvent("${event}") selectElement("#a") addController("Confetti") ] []
}
`;

describe('host modules in the CLI', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-host-'));
    fs.writeFileSync(path.join(dir, 'layout.html'), '<div id="stage"><div id="a"></div></div>\n');
    fs.writeFileSync(path.join(dir, 'styles.css'), '#stage {}\n#a {}\n');
    fs.writeFileSync(path.join(dir, 'host.ts'), HOST);
    fs.writeFileSync(path.join(dir, 'main.eligian'), program('intro'));
    fs.writeFileSync(path.join(dir, 'broken.eligian'), program('boom'));
    fs.writeFileSync(
      path.join(dir, 'missing.eligian'),
      program('intro').replace('function formatPrice', 'function formatPrice\n  function nowhere')
    );
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the compile result names the host module', async () => {
    const { host } = await compileFile(path.join(dir, 'main.eligian'));
    expect(host).toEqual({
      path: path.join(dir, 'host.ts'),
      operations: ['trackEvent'],
      controllers: ['Confetti'],
      functions: ['formatPrice'],
    });
  });

  it('the bundle entry imports the module and maps the declared names, not from eligius', async () => {
    const { config, host } = await compileFile(path.join(dir, 'main.eligian'));
    const entry = generateEntryPoint(config, ['trackEvent', 'selectElement'], host);
    expect(entry).toContain(
      `import * as host from ${JSON.stringify(host!.path.split(path.sep).join('/'))};`
    );
    expect(entry).not.toContain("import { trackEvent } from 'eligius'");
    expect(entry).not.toContain("import { Confetti } from 'eligius'");
    expect(entry).toContain("import { selectElement } from 'eligius'");
    expect(entry).toContain('"trackEvent": { "trackEvent": host.operations?.["trackEvent"] },');
    expect(entry).toContain('"Confetti": { "Confetti": host.controllers?.["Confetti"] },');
    expect(entry).toContain('"formatPrice": { "formatPrice": host.functions?.["formatPrice"] },');
  });

  it('bundles the TypeScript host module', async () => {
    const result = await Effect.runPromise(
      createBundle(path.join(dir, 'main.eligian'), {
        outputDir: path.join(dir, 'out'),
        force: true,
      })
    );
    const bundle = fs.readFileSync(path.join(result.outputDir, 'bundle.js'), 'utf-8');
    expect(bundle).toContain('tracking failed');
    expect(bundle).toContain('"Confetti"');
  }, 30000);

  it('smoke runs the host code: a failing host operation is reported at its call', async () => {
    const clean = await runSmoke(['main.eligian'], { format: 'json', strict: false, cwd: dir });
    expect(JSON.parse(clean.output)[0].problems).toEqual([]);
    const broken = await runSmoke(['broken.eligian'], { format: 'json', strict: false, cwd: dir });
    const [problem] = JSON.parse(broken.output)[0].problems;
    expect(problem.message).toContain('trackEvent');
    expect(problem.message).toContain('tracking failed');
    expect(problem.location.line).toBe(9);
  }, 30000);

  it('a declared name the module does not export is reported', async () => {
    const outcome = await runSmoke(['missing.eligian'], {
      format: 'json',
      strict: false,
      cwd: dir,
    });
    const messages = JSON.parse(outcome.output)[0].problems.map(
      (p: { message: string }) => p.message
    );
    expect(messages).toContain(
      `the extensions module ${path.join(dir, 'host.ts')} does not export functions.nowhere`
    );
    expect(
      registrationsOf(
        { operations: { a: (() => {}) as never } },
        {
          path: 'x',
          operations: ['a', 'b'],
          controllers: [],
          functions: [],
        }
      ).missing
    ).toEqual(['operations.b']);
  }, 30000);
});
