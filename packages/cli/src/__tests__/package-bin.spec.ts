/**
 * The npm package `eligian`: the `bin` entries point at the launcher that
 * calls main() (bin/cli.js; dist/cli.mjs only exports main), and the package
 * is self-contained: the workspace packages are bundled into dist/cli.mjs, so
 * it imports only Node built-ins and the declared dependencies, and npm packs
 * exactly the launcher, the bundle, the generated docs (dist/docs), the README
 * and the LICENSE.
 *
 * The bundle and pack checks run once the CLI was built (CI builds first).
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf-8')) as {
  name: string;
  version: string;
  bin: Record<string, string>;
  files: string[];
  dependencies: Record<string, string>;
  mcpName?: string;
};
const bundlePath = resolve(packageRoot, 'dist', 'cli.mjs');
const built = existsSync(bundlePath) && existsSync(resolve(packageRoot, 'LICENSE'));
const bin = resolve(packageRoot, 'bin', 'cli.js');
// FR-083: the eval assertion library, built next to the CLI and never packed
const evalsBundlePath = resolve(packageRoot, 'dist', 'evals', 'assert.mjs');
// The mcp command counts once the CLI lists it in its --help (no flag to keep in sync)
const hasMcp =
  built &&
  /^\s+mcp\b/m.test(execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf-8' }));
const eligiusVersion = (
  JSON.parse(
    readFileSync(
      createRequire(resolve(packageRoot, 'package.json')).resolve('eligius/package.json'),
      'utf-8'
    )
  ) as { version: string }
).version;

/** The files `npm pack` would put in the tarball (POSIX paths, sorted) */
function packedFiles(): string[] {
  // --ignore-scripts: no prepack (production build) for a listing
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageRoot,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  const [packed] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
  return packed.files.map(file => file.path).sort();
}

/** The `initialize` response frame of the spawned `eligian mcp` */
interface InitializeAnswer {
  id?: unknown;
  result?: { protocolVersion: string; serverInfo: { name: string; version: string } };
}

/** A JSON-RPC frame of the spawned `eligian mcp` (a response has an `id` and no `method`) */
interface JsonRpcFrame {
  id?: unknown;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
}

describe('the eligian npm package', () => {
  test.each(['eligian', 'eligian-cli'])('%s points at the bin/cli.js launcher', name => {
    expect(pkg.bin[name]).toBe('./bin/cli.js');
    expect(existsSync(resolve(packageRoot, pkg.bin[name]))).toBe(true);
  });

  test('launcher is published and actually invokes main()', () => {
    expect(pkg.files).toContain('bin/cli.js');
    const launcher = readFileSync(resolve(packageRoot, 'bin', 'cli.js'), 'utf-8');
    expect(launcher.startsWith('#!/usr/bin/env node')).toBe(true);
    expect(launcher).toMatch(/\bmain\(\)/);
  });

  test('depends on no workspace package (they are bundled in)', () => {
    expect(pkg.name).toBe('eligian');
    const workspace = Object.entries(pkg.dependencies).filter(
      ([name, range]) => name.startsWith('@eligian/') || range.startsWith('workspace:')
    );
    expect(workspace).toEqual([]);
  });

  test.skipIf(!built)('the bundle imports only Node built-ins and the dependencies', () => {
    const code = readFileSync(bundlePath, 'utf-8');
    const specifiers = new Set(
      [
        ...code.matchAll(/(?:^|[;\n])\s*import\s[^;'"]*?from\s*["']([^"']+)["']/g),
        ...code.matchAll(/(?:^|[;\n])\s*import\s*["']([^"']+)["']/g),
        ...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
      ].map(match => match[1])
    );
    const declared = (specifier: string) =>
      Object.keys(pkg.dependencies).some(
        name => specifier === name || specifier.startsWith(`${name}/`)
      );
    const builtin = (specifier: string) =>
      specifier.startsWith('node:') || builtinModules.includes(specifier);
    // A bundle has no relative imports: those are Eligian source in the starter templates
    const relative = (specifier: string) => specifier.startsWith('.');
    expect([...specifiers].filter(s => !builtin(s) && !declared(s) && !relative(s))).toEqual([]);
  });

  test.skipIf(!built)('--version prints the package version', () => {
    const result = spawnSync(
      process.execPath,
      [resolve(packageRoot, 'bin', 'cli.js'), '--version'],
      {
        encoding: 'utf-8',
      }
    );
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  test.skipIf(!built)('help names mcp and the check defaults', () => {
    const help = execFileSync(process.execPath, [bin, 'check', '--help'], { encoding: 'utf-8' });
    expect(help).toContain('--no-review');
    expect(help).toContain('(default: "ids")');
    const topHelp = execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf-8' });
    expect(topHelp).toContain(
      "Run 'eligian <command> --help' (compile, check, fmt, smoke, dev, init, mcp) for its options."
    );
  });

  test.skipIf(!built)('the bundle carries the injected versions', () => {
    const code = readFileSync(bundlePath, 'utf-8');
    expect(code).not.toContain('__ELIGIAN_VERSION__');
    expect(code).not.toContain('__ELIGIUS_VERSION__');
    expect(code).toContain(JSON.stringify(pkg.version));
    expect(code).toContain(JSON.stringify(eligiusVersion));
  });

  test.skipIf(!built)('--version starts in under 3 s (median of 5)', { timeout: 60_000 }, () => {
    spawnSync(process.execPath, [bin, '--version']); // warm-up, not counted
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      spawnSync(process.execPath, [bin, '--version']);
      times.push(Math.round(performance.now() - start));
    }
    const median = [...times].sort((a, b) => a - b)[2];
    console.info(`--version startup (ms): ${times.join(' ')} median ${median}`);
    expect(median).toBeLessThan(3000);
  });

  test.skipIf(!built || !hasMcp)(
    'mcp answers initialize in under 3 s',
    { timeout: 20_000 },
    async () => {
      const child = spawn(process.execPath, [process.env.ELIGIAN_BIN ?? bin, 'mcp']);
      try {
        const start = performance.now();
        const answered = new Promise<InitializeAnswer>((resolveAnswer, reject) => {
          let buffered = '';
          child.stdout.setEncoding('utf-8');
          child.stdout.on('data', (chunk: string) => {
            buffered += chunk;
            const lines = buffered.split('\n');
            buffered = lines.pop() ?? '';
            for (const line of lines) {
              try {
                const message = JSON.parse(line) as InitializeAnswer;
                if (message.id === 1 && message.result !== undefined) resolveAnswer(message);
              } catch {
                // not a protocol frame
              }
            }
          });
          child.on('error', reject);
          child.on('exit', code => reject(new Error(`mcp exited (${code}) before answering`)));
        });
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'package-bin.spec', version: '0' },
            },
          })}\n`
        );
        const answer = await answered;
        const elapsed = performance.now() - start;
        console.info(`mcp initialize answered in ${Math.round(elapsed)} ms`);
        expect(answer.result).toBeDefined();
        expect(answer.result?.serverInfo.version).toBe(pkg.version);
        expect(answer.result?.protocolVersion).toBe('2025-06-18');
        expect(elapsed).toBeLessThan(3000);
      } finally {
        child.kill();
      }
    }
  );

  // Spec 059 SC-015 (FR-003, P18): the first-run scan of 200 programs runs in the background, so
  // `initialize` does not wait for it; the first gated call waits for it and is not refused
  test.skipIf(!built || !hasMcp)(
    'mcp answers initialize in under 3 s with 200 programs; the first check on an existing program runs',
    { timeout: 60_000 },
    async () => {
      const root = mkdtempSync(resolve(tmpdir(), 'eligian-cold-start-'));
      for (let index = 0; index < 200; index++) {
        const name = `p${String(index).padStart(3, '0')}`;
        writeFileSync(
          resolve(root, `${name}.eligian`),
          `timeline "${name}" in "#s" using raf {}\n`,
          'utf-8'
        );
      }
      const start = performance.now();
      const child = spawn(process.execPath, [process.env.ELIGIAN_BIN ?? bin, 'mcp'], {
        cwd: root,
      });
      let stderr = '';
      child.stderr.setEncoding('utf-8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      const pending = new Map<number, (frame: JsonRpcFrame) => void>();
      const exited = new Promise<never>((_, reject) => {
        child.on('error', reject);
        child.on('exit', code =>
          reject(new Error(`mcp exited (${code}) before answering; stderr:\n${stderr}`))
        );
      });
      exited.catch(() => undefined); // the kill at the end rejects it; nothing waits then
      let buffered = '';
      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (chunk: string) => {
        buffered += chunk;
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const frame = JSON.parse(line) as JsonRpcFrame;
            if (typeof frame.id === 'number' && frame.method === undefined) {
              pending.get(frame.id)?.(frame);
            }
          } catch {
            // not a protocol frame
          }
        }
      });
      const send = (message: Record<string, unknown>): void => {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
      };
      const request = (id: number, method: string, params: unknown): Promise<JsonRpcFrame> => {
        const answer = new Promise<JsonRpcFrame>(resolveAnswer => pending.set(id, resolveAnswer));
        send({ id, method, params });
        return Promise.race([answer, exited]);
      };
      try {
        const init = await request(1, 'initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'package-bin.spec', version: '0' },
        });
        const elapsed = performance.now() - start;
        console.info(`mcp initialize with 200 programs answered in ${Math.round(elapsed)} ms`);
        expect(init.error, stderr).toBeUndefined();
        expect(init.result).toBeDefined();
        expect(elapsed).toBeLessThan(3000);

        send({ method: 'notifications/initialized' });
        const check = await request(2, 'tools/call', {
          name: 'eligian_check',
          arguments: { paths: ['p000.eligian'] },
        });
        expect(check.error, stderr).toBeUndefined();
        const result = check.result as { content: { text: string }[]; isError?: boolean };
        const payload = JSON.parse(result.content[0].text) as {
          error?: { kind?: string; gate?: { code?: string } };
        };
        expect(payload.error?.gate?.code, result.content[0].text).toBeUndefined();
        expect(result.isError === true, result.content[0].text).toBe(false);
      } finally {
        child.kill();
        await new Promise<void>(resolveExit => {
          if (child.exitCode !== null || child.signalCode !== null) resolveExit();
          else child.once('exit', () => resolveExit());
        });
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  // jsdom, esbuild, effect/ai and the eligius engine load only on the paths that use them
  // (SC-018; `eligius/lint` is allowed)
  test.skipIf(!built)('no static import of jsdom, esbuild, effect/ai or the eligius engine', () => {
    const code = readFileSync(bundlePath, 'utf-8');
    const staticImports = [
      ...code.matchAll(
        /(?:^|[;\n])\s*import\s*[^;'"(]*?from\s*["'](jsdom|esbuild|effect\/ai|eligius(?!\/))(\/[^"']*)?["']/g
      ),
      ...code.matchAll(
        /(?:^|[;\n])\s*import\s*["'](jsdom|esbuild|effect\/ai|eligius(?!\/))(\/[^"']*)?["']/g
      ),
    ].map(match => match[0].trim());
    expect(staticImports).toEqual([]);
    expect(code).toMatch(/\bimport\(\s*["']jsdom["']\s*\)/);
    expect(code).toMatch(/\bimport\(\s*["']esbuild["']\s*\)/);
    expect(code).toMatch(/\bimport\(\s*["']effect\/ai["']\s*\)/);
  });

  // npm starts a process of its own: slow while the other suites run in parallel
  test.skipIf(!built)(
    'npm packs the launcher, the bundle, the docs, the README and the LICENSE',
    {
      timeout: 30_000,
    },
    () => {
      // Every file the knowledge generator wrote (the build runs it), POSIX separators
      const docsDir = resolve(packageRoot, 'dist', 'docs');
      const docs = existsSync(docsDir)
        ? readdirSync(docsDir, { recursive: true, encoding: 'utf-8' })
            .filter(file => statSync(resolve(docsDir, file)).isFile())
            .map(file => `dist/docs/${file.split('\\').join('/')}`)
        : [];
      expect(docs).toContain('dist/docs/index.json');
      const files = packedFiles();
      expect(files).toEqual(
        ['LICENSE', 'README.md', 'bin/cli.js', 'dist/cli.mjs', 'package.json', ...docs].sort()
      );
      // FR-096: the sources' docs are among them: every hand-written chunk and overlay
      // (`curriculum/*.md`, `curriculum/{diagnostics,operations,controllers}/*.md`), one
      // `generated/examples/<id>.md` per `// @mcp-example <id>` marker of the tour, the overlay map
      const curriculumDir = resolve(packageRoot, 'src', 'mcp', 'knowledge', 'curriculum');
      const markdown = (dir: string) =>
        readdirSync(resolve(curriculumDir, dir)).filter(name => name.endsWith('.md'));
      const curriculum = [
        ...markdown('.').map(name => `dist/docs/curriculum/${name}`),
        ...['diagnostics', 'operations', 'controllers'].flatMap(dir =>
          markdown(dir).map(name => `dist/docs/curriculum/${dir}/${name}`)
        ),
      ];
      const tourDir = resolve(packageRoot, '..', '..', 'examples', 'eligian-tour');
      const examples = readdirSync(tourDir)
        .filter(name => name.endsWith('.eligian'))
        .flatMap(name => [
          ...readFileSync(resolve(tourDir, name), 'utf-8').matchAll(
            /^\s*\/\/\s*@mcp-example\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s/gm
          ),
        ])
        .map(match => `dist/docs/generated/examples/${match[1]}.md`);
      expect(curriculum.length).toBeGreaterThan(0);
      expect(examples.length).toBeGreaterThan(0);
      const missing = [...curriculum, ...examples, 'dist/docs/overlays.json'].filter(
        file => !files.includes(file)
      );
      expect(missing).toEqual([]);
      // FR-010 / FR-011: the registry metadata stays in the repo, the plugins never ship,
      // and the packed package.json carries the registry name
      expect(files).not.toContain('server.json');
      expect(
        files.filter(f => /^(plugins|\.claude-plugin|\.cursor-plugin|\.agents)\//.test(f))
      ).toEqual([]);
      expect(files).toContain('package.json');
      expect(pkg.mcpName).toBe('io.github.rolandzwaga/eligian');
    }
  );

  // FR-083 / FR-080: the eval harness imports the build output; npm never ships it
  test.skipIf(!built)(
    'dist/evals/assert.mjs exists after a build and is not packed',
    { timeout: 30_000 },
    () => {
      expect(existsSync(evalsBundlePath)).toBe(true);
      expect(packedFiles().filter(file => file.startsWith('dist/evals/'))).toEqual([]);
    }
  );

  test.skipIf(!built)(
    'the eval bundle loads and exports evaluateAssertions, runGateSteps, computeMetrics, parseHarnessArgs',
    { timeout: 30_000 },
    async () => {
      const evals = (await import(
        /* @vite-ignore */ pathToFileURL(evalsBundlePath).href
      )) as Record<string, unknown>;
      for (const name of [
        'evaluateAssertions',
        'runGateSteps',
        'computeMetrics',
        'parseHarnessArgs',
      ]) {
        expect(typeof evals[name], name).toBe('function');
      }
    }
  );

  // Spec 058 Phase 5 (A0-1 / DV3): the evidence script imports the promotion evidence from the bundle
  test.skipIf(!built)(
    'the eval bundle exports promotionEvidence and renderPromotionEvidence',
    { timeout: 30_000 },
    async () => {
      const evals = (await import(
        /* @vite-ignore */ pathToFileURL(evalsBundlePath).href
      )) as Record<string, unknown>;
      expect(typeof evals.promotionEvidence).toBe('function');
      expect(typeof evals.renderPromotionEvidence).toBe('function');
      expect(evals.REVIEW_CODES).toHaveLength(9);
    }
  );
});
