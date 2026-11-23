/**
 * Spec 058 Phase 5 (FR-011, FR-012, SC-004): the MCP registry metadata. `server.json` names
 * the server as `package.json`'s `mcpName`, carries the package version, and launches the
 * `eligian` npm package over stdio with the one positional argument `mcp`. The spec compares
 * the parsed JSON, so Biome's formatting of `server.json` does not matter. The handshake spawns
 * `bin/cli.js` with `packageArguments` as its arguments (the built bundle is required).
 * FR-013, FR-014, SC-006: a text-level read of `.github/workflows/publish-cli.yml` (no YAML
 * parser): the registry steps, their order, the pinned `mcp-publisher`, and `registry_only`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireFreshBundle } from './fresh-bundle.js';
import { spawnServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface ServerJson {
  readonly $schema: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly repository: unknown;
  readonly version: string;
  readonly packages: readonly {
    readonly registryType: string;
    readonly registryBaseUrl: string;
    readonly identifier: string;
    readonly version: string;
    readonly transport: { readonly type: string };
    readonly packageArguments: readonly { readonly type: string; readonly value: string }[];
    readonly environmentVariables?: readonly {
      readonly name: string;
      readonly isRequired?: boolean;
      readonly isSecret?: boolean;
    }[];
  }[];
}

const server = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '..', '..', 'server.json'), 'utf-8')
) as ServerJson;
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '..', '..', 'package.json'), 'utf-8')
) as { name: string; version: string; mcpName?: string };

describe('server.json (FR-011, FR-012, SC-004)', () => {
  it('names the server as package.json mcpName', () => {
    expect(server.name).toBe(pkg.mcpName);
    expect(server.name).toBe('io.github.rolandzwaga/eligian');
  });

  it('carries the package version three times', () => {
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0].version).toBe(pkg.version);
  });

  it('points at the eligian npm package with the stdio transport', () => {
    expect(server.packages.length).toBe(1);
    const [entry] = server.packages;
    expect(entry.registryType).toBe('npm');
    expect(entry.registryBaseUrl).toBe('https://registry.npmjs.org');
    expect(entry.identifier).toBe(pkg.name);
    expect(entry.transport.type).toBe('stdio');
  });

  it('launches with exactly the positional argument mcp', () => {
    const args = server.packages[0].packageArguments;
    expect(args.map(a => a.value)).toEqual(['mcp']);
    expect(args.every(a => a.type === 'positional')).toBe(true);
  });

  it('has a description of at most 100 characters', () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.title).toBe('Eligian');
    expect(server.$schema).toBe(
      'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json'
    );
    expect(server.repository).toEqual({
      url: 'https://github.com/rolandzwaga/eligian',
      source: 'github',
      subfolder: 'packages/cli',
    });
    const variables = server.packages.flatMap(entry => entry.environmentVariables ?? []);
    expect(variables.filter(v => v.isRequired === true || v.isSecret === true)).toEqual([]);
  });
});

const INITIALIZE = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'mcp-registry-spec', version: '0' },
};

describe('packageArguments start the server (FR-012, SC-004)', () => {
  beforeAll(() => requireFreshBundle());

  it('packageArguments start the server: initialize answers with serverInfo.name eligian', {
    timeout: 30_000,
  }, async () => {
    const args = server.packages[0].packageArguments.map(a => a.value);
    const child = spawnServer({ args });
    try {
      const answer = await child.request('initialize', INITIALIZE);
      expect((answer.result as { serverInfo: { name: string } }).serverInfo.name).toBe('eligian');
    } finally {
      await child.close();
    }
  });

  it('negative control: no arguments runs compile, which exits before any frame', {
    timeout: 30_000,
  }, async () => {
    const child = spawnServer({ args: [] });
    try {
      await expect(child.request('initialize', INITIALIZE)).rejects.toThrow(
        /mcp exited \(1\) before answering initialize/
      );
      expect(child.stdoutLines()).toEqual([]);
      expect(child.stderr()).toMatch(/missing required argument 'input'/);
    } finally {
      await child.close();
    }
  });
});

const REPO = path.resolve(HERE, '..', '..', '..', '..');
const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'publish-cli.yml'), 'utf-8');

/** A job's text: from the line `  <name>:` to the next line indented by two spaces, or EOF. */
function jobBlock(workflow: string, name: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  if (start < 0) throw new Error(`no block '${name}' in publish-cli.yml`);
  const length = lines.slice(start + 1).findIndex(line => /^ {2}\S/.test(line));
  return lines.slice(start, length < 0 ? undefined : start + 1 + length).join('\n');
}

/** A key's text: from the line `<indent><key>:` to the next non-blank line indented no deeper. */
function keyBlock(text: string, key: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.trimStart() === `${key}:`);
  if (start < 0) throw new Error(`no key '${key}'`);
  const indent = lines[start].length - lines[start].trimStart().length;
  const length = lines
    .slice(start + 1)
    .findIndex(line => line.trim() !== '' && line.length - line.trimStart().length <= indent);
  return lines.slice(start, length < 0 ? undefined : start + 1 + length).join('\n');
}

/** The steps of a job block, split on `      - name: `. */
function steps(block: string): { name: string; body: string }[] {
  return block
    .split(/^ {6}- name: /m)
    .slice(1)
    .map(body => ({ name: body.split(/\r?\n/, 1)[0].trim(), body }));
}

describe('publish-cli.yml (FR-013, SC-006; amended 2026-11-23)', () => {
  const publishJob = jobBlock(yml, 'publish');
  const registryJob = jobBlock(yml, 'registry');
  const releaseJob = jobBlock(yml, 'release');
  const publishSteps = steps(publishJob);
  const registrySteps = steps(registryJob);
  const names = publishSteps.map(s => s.name);
  const at = (name: string): number => names.indexOf(name);
  const stepBody = (list: { name: string; body: string }[], job: string, name: string): string => {
    const step = list.find(s => s.name === name);
    if (step === undefined) throw new Error(`no step '${name}' in the ${job} job`);
    return step.body;
  };
  const body = (name: string): string => stepBody(publishSteps, 'publish', name);
  const registryBody = (name: string): string => stepBody(registrySteps, 'registry', name);
  /** The job's own `if:` line (indented four spaces), '' when it has none. */
  const jobIf = (job: string): string => /^ {4}if:.*$/m.exec(job)?.[0] ?? '';
  const loopSeconds = (text: string): number => {
    const attempts = /attempts=(\d+)/.exec(text);
    const sleep = /sleep (\d+)/.exec(text);
    expect(attempts).not.toBeNull();
    expect(sleep).not.toBeNull();
    return Number(attempts![1]) * Number(sleep![1]);
  };

  it('orders the publish job steps', () => {
    for (const name of [
      'Pack',
      'Try the package',
      'Install mcp-publisher',
      'Validate server.json',
      'Publish',
      'Keep the tarball',
    ]) {
      expect(at(name), name).toBeGreaterThanOrEqual(0);
    }
    expect(at('Pack')).toBeLessThan(at('Try the package'));
    expect(at('Try the package')).toBeLessThan(at('Install mcp-publisher'));
    expect(at('Install mcp-publisher')).toBeLessThan(at('Validate server.json'));
    expect(at('Validate server.json')).toBeLessThan(at('Publish'));
    expect(at('Publish')).toBeLessThan(at('Keep the tarball'));
    expect(names.filter(name => name === 'Publish')).toHaveLength(1);
    expect(names).not.toContain('Publish to the MCP registry');
  });

  it('pins mcp-publisher by tag and checks its sha256 before extracting, in both jobs', () => {
    for (const install of [body('Install mcp-publisher'), registryBody('Install mcp-publisher')]) {
      expect(install).toMatch(/releases\/download\/v\d+\.\d+\.\d+\//);
      expect(install).not.toMatch(/latest/);
      expect(install).toMatch(/[0-9a-f]{64}/);
      expect(install.indexOf('sha256sum -c')).toBeGreaterThanOrEqual(0);
      expect(install.indexOf('tar x')).toBeGreaterThanOrEqual(0);
      expect(install.indexOf('sha256sum -c')).toBeLessThan(install.indexOf('tar x'));
    }
  });

  it('publishes to the registry in its own job after npm: wait for npm, then a bounded retry', () => {
    expect(registryJob).toContain('needs: publish');
    expect(registryJob).toContain('id-token: write');
    const order = registrySteps.map(s => s.name);
    expect(order.indexOf('Install mcp-publisher')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('Install mcp-publisher')).toBeLessThan(order.indexOf('Wait for npm'));
    expect(order.indexOf('Wait for npm')).toBeLessThan(
      order.indexOf('Publish to the MCP registry')
    );

    const wait = registryBody('Wait for npm');
    expect(wait).toContain('npm view');
    expect(loopSeconds(wait)).toBeLessThanOrEqual(900);
    expect(wait).toContain('exit 1');

    const registry = registryBody('Publish to the MCP registry');
    expect(registry).not.toContain('continue-on-error');
    expect(registry.indexOf('login github-oidc')).toBeGreaterThanOrEqual(0);
    expect(registry.indexOf('login github-oidc')).toBeLessThan(
      registry.indexOf('mcp-publisher publish')
    );
    expect(loopSeconds(registry)).toBeLessThanOrEqual(300);
    expect(registry).toContain('exit 1');
    expect(registry).toContain('registry_only');

    const validate = body('Validate server.json');
    expect(validate).toContain('mcp-publisher validate');
    expect(validate).toContain('working-directory: packages/cli');
  });

  it('uses no secrets', () => {
    expect(/secrets\./.test(yml)).toBe(false);
    expect(publishJob).toContain('id-token: write');
  });

  it('keeps the release job behind the publish job only, never the registry job', () => {
    expect(releaseJob).toContain('needs: publish');
    expect(releaseJob).not.toMatch(/needs:.*registry/);
  });

  it('registry_only skips the publish and release jobs and runs the registry job', () => {
    const input = keyBlock(jobBlock(yml, 'workflow_dispatch'), 'registry_only');
    expect(input).toContain('type: boolean');
    expect(input).toContain('default: false');
    expect(jobIf(publishJob)).toContain('!inputs.registry_only');
    expect(jobIf(releaseJob)).toContain('!inputs.registry_only');
    // Runs alone under registry_only (publish skipped), else only after npm succeeded
    expect(jobIf(registryJob)).toContain('inputs.registry_only ||');
    expect(jobIf(registryJob)).toContain("needs.publish.result == 'success'");
    expect(jobIf(registryJob)).toContain('!cancelled()');
    for (const step of registrySteps) {
      expect(step.body, step.name).not.toMatch(/^\s*if:.*registry_only/m);
    }
  });

  it('Try the package checks the installed mcpName before Publish (P21)', () => {
    const tryIt = body('Try the package');
    expect(tryIt).toContain('mcpName');
    expect(tryIt).toContain('io.github.rolandzwaga/eligian');
    expect(at('Try the package')).toBeLessThan(at('Publish'));
  });
});
