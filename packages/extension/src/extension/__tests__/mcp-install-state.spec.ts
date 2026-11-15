/**
 * The pure install-state helpers of the MCP server registration (spec 058 phase 4, plan A2):
 * the version gate, the folder's eligian install, JSONC, the detection of a user-configured
 * Eligian server, and the package manager / install command (FR-002 (c)(d), FR-004, FR-034,
 * FR-035, FR-036, SC-005, SC-020, SC-021). Real temp dirs, no vscode.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  admitsMinimum,
  findPackageManager,
  hasEligianServer,
  installCommand,
  meetsMinimum,
  type PackageManager,
  parseJsonc,
  readEligianInstall,
  vscodeMcpJsonState,
} from '../mcp/install-state.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (relative: string, content: string): string => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};

const dir = (relative: string): string => {
  const d = path.join(root, relative);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

describe('meetsMinimum', () => {
  it.each(['1.1.0', '1.1.0-beta.1', '1.2.3', '2.0.0'])('%s meets 1.1', version => {
    expect(meetsMinimum(version)).toBe(true);
  });

  it.each(['1.0.9', '0.9.0', undefined, 'abc', 42])('%s does not meet 1.1', version => {
    expect(meetsMinimum(version)).toBe(false);
  });
});

describe('readEligianInstall', () => {
  const pkg = (content: string) =>
    write(path.join('node_modules', 'eligian', 'package.json'), content);
  const bin = () => write(path.join('node_modules', 'eligian', 'bin', 'cli.js'), '');

  it('no node_modules/eligian/package.json is missing', async () => {
    expect(await readEligianInstall(root)).toEqual({ ok: false, problem: 'missing' });
  });

  it('a string version that does not parse is bad-version with the version', async () => {
    pkg('{"version":"abc"}');
    expect(await readEligianInstall(root)).toEqual({
      ok: false,
      problem: 'bad-version',
      version: 'abc',
    });
  });

  it.each(['{}', 'not json'])('%s is bad-version with no version key', async content => {
    pkg(content);
    const install = await readEligianInstall(root);
    expect(install).toEqual({ ok: false, problem: 'bad-version' });
    expect('version' in install).toBe(false);
  });

  it('1.0.3 is too-old', async () => {
    pkg('{"version":"1.0.3"}');
    bin();
    expect(await readEligianInstall(root)).toEqual({
      ok: false,
      problem: 'too-old',
      version: '1.0.3',
    });
  });

  it('1.1.0 without bin/cli.js is no-bin', async () => {
    pkg('{"version":"1.1.0"}');
    expect(await readEligianInstall(root)).toEqual({
      ok: false,
      problem: 'no-bin',
      version: '1.1.0',
    });
  });

  it('1.1.0 with bin/cli.js is ok', async () => {
    pkg('{"version":"1.1.0"}');
    bin();
    expect(await readEligianInstall(root)).toEqual({
      ok: true,
      version: '1.1.0',
      cliPath: path.join(root, 'node_modules', 'eligian', 'bin', 'cli.js'),
    });
  });
});

describe('parseJsonc', () => {
  it('drops line and block comments', () => {
    expect(parseJsonc('{\n  // line\n  "a": /* block */ 1\n}')).toEqual({ a: 1 });
  });

  it('keeps comment markers inside strings', () => {
    expect(parseJsonc('{ "a": "a // b", "b": "/* x */" }')).toEqual({
      a: 'a // b',
      b: '/* x */',
    });
  });

  it('keeps escaped quotes inside strings', () => {
    expect(parseJsonc('{ "a": "say \\"hi\\" // still a string" }')).toEqual({
      a: 'say "hi" // still a string',
    });
  });

  it('accepts trailing commas before } and ]', () => {
    expect(parseJsonc('{ "a": [1, 2, ], "b": { "c": 3, }, }')).toEqual({
      a: [1, 2],
      b: { c: 3 },
    });
    expect(parseJsonc('{ "a": [1, /* x */ ] // y\n , }')).toEqual({ a: [1] });
  });

  it('keeps a comma inside a string', () => {
    expect(parseJsonc('{ "a": "x,}" }')).toEqual({ a: 'x,}' });
  });

  it('returns undefined when the text does not parse', () => {
    expect(parseJsonc('{')).toBeUndefined();
  });
});

describe('hasEligianServer', () => {
  it.each([
    ['the eligian key', { eligian: {} }],
    [
      'a Windows cli.js path then mcp',
      {
        'eligian-mcp': {
          command: 'node',
          args: ['C:\\p\\node_modules\\eligian\\bin\\cli.js', 'mcp'],
        },
      },
    ],
    [
      'a POSIX cli.js path then mcp',
      { 'eligian-mcp': { command: 'node', args: ['/p/node_modules/eligian/bin/cli.js', 'mcp'] } },
    ],
    ['npx eligian mcp', { x: { command: 'npx', args: ['eligian', 'mcp'] } }],
    ['npx eligian@1.2.0 mcp', { x: { command: 'npx', args: ['eligian@1.2.0', 'mcp'] } }],
    [
      'the Windows npx form',
      { x: { command: 'cmd', args: ['/c', 'npx', '-y', 'eligian@^1.1', 'mcp'] } },
    ],
    ['an explicit stdio type', { x: { type: 'stdio', command: 'npx', args: ['eligian', 'mcp'] } }],
  ])('true for %s', (_name, servers) => {
    expect(hasEligianServer(servers)).toBe(true);
  });

  it.each([
    [
      'cli.js without mcp after it',
      { x: { command: 'node', args: ['C:\\p\\node_modules\\eligian\\bin\\cli.js', 'check'] } },
    ],
    ['eligian-tools', { x: { command: 'npx', args: ['eligian-tools', 'mcp'] } }],
    ['an unrelated server', { other: { command: 'node', args: ['server.js'] } }],
    [
      'a non-stdio server',
      { x: { type: 'http', url: 'http://localhost:1', args: ['eligian', 'mcp'] } },
    ],
    ['undefined', undefined],
    ['an array', []],
    ['a string', 'x'],
  ])('false for %s', (_name, servers) => {
    expect(hasEligianServer(servers)).toBe(false);
  });
});

describe('vscodeMcpJsonState', () => {
  it('no file is none', async () => {
    expect(await vscodeMcpJsonState(root)).toBe('none');
  });

  it('a commented file with servers.eligian is configured', async () => {
    write(
      path.join('.vscode', 'mcp.json'),
      '{\n  // written by eligian agents setup\n  "servers": { "eligian": {} }\n}'
    );
    expect(await vscodeMcpJsonState(root)).toBe('configured');
  });

  it('an unrelated server is none', async () => {
    write(
      path.join('.vscode', 'mcp.json'),
      '{ "servers": { "other": { "command": "node", "args": ["server.js"] } } }'
    );
    expect(await vscodeMcpJsonState(root)).toBe('none');
  });

  it('a file that does not parse is unparsable', async () => {
    write(path.join('.vscode', 'mcp.json'), '{');
    expect(await vscodeMcpJsonState(root)).toBe('unparsable');
  });
});

const MARKERS = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'package-lock.json',
  'package.json',
];

/** The walk of case (4) leaves the temp tree; fail loudly when the machine has a marker above it. */
const markerAboveTmpdir = (): string | undefined => {
  let d = path.dirname(fs.realpathSync(os.tmpdir()));
  for (;;) {
    for (const marker of MARKERS) {
      const file = path.join(d, marker);
      if (!fs.existsSync(file)) continue;
      if (marker !== 'package.json') return file;
      try {
        if (JSON.parse(fs.readFileSync(file, 'utf8')).packageManager !== undefined) return file;
      } catch {
        // not a packageManager declaration
      }
    }
    const parent = path.dirname(d);
    if (parent === d) return undefined;
    d = parent;
  }
};

const ADD: Record<PackageManager, string> = {
  pnpm: 'pnpm add -D eligian@^1.1',
  yarn: 'yarn add -D eligian@^1.1',
  bun: 'bun add -d eligian@^1.1',
  npm: 'npm install --save-dev eligian@^1.1',
};

const INSTALL: Record<PackageManager, string> = {
  pnpm: 'pnpm install',
  yarn: 'yarn install',
  bun: 'bun install',
  npm: 'npm install',
};

describe('findPackageManager / installCommand', () => {
  describe('(1) a lockfile in the folder', () => {
    it.each([
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['bun.lock', 'bun'],
      ['bun.lockb', 'bun'],
      ['package-lock.json', 'npm'],
    ] as const)('%s → %s', async (lockfile, manager) => {
      const folder = dir('talk');
      write(path.join('talk', lockfile), '');
      expect(await findPackageManager(folder)).toBe(manager);
      expect(await installCommand(folder)).toBe(ADD[manager]);
    });
  });

  describe('(2) a lockfile in an ancestor', () => {
    it('pnpm-lock.yaml two levels up → pnpm', async () => {
      write('pnpm-lock.yaml', '');
      const folder = dir(path.join('packages', 'talk'));
      expect(await findPackageManager(folder)).toBe('pnpm');
      expect(await installCommand(folder)).toBe('pnpm add -D eligian@^1.1');
    });

    it('the nearest of two ancestors wins', async () => {
      write('pnpm-lock.yaml', '');
      write(path.join('packages', 'yarn.lock'), '');
      const folder = dir(path.join('packages', 'talk'));
      expect(await findPackageManager(folder)).toBe('yarn');
      expect(await installCommand(folder)).toBe('yarn add -D eligian@^1.1');
    });
  });

  describe('(3) the packageManager field', () => {
    it('an ancestor package.json with packageManager pnpm@9.0.0 and no lockfile → pnpm', async () => {
      write('package.json', JSON.stringify({ packageManager: 'pnpm@9.0.0' }));
      const folder = dir(path.join('packages', 'talk'));
      expect(await findPackageManager(folder)).toBe('pnpm');
      expect(await installCommand(folder)).toBe('pnpm add -D eligian@^1.1');
    });

    it('in one directory a lockfile wins over the field', async () => {
      write('yarn.lock', '');
      write('package.json', JSON.stringify({ packageManager: 'pnpm@9.0.0' }));
      expect(await findPackageManager(root)).toBe('yarn');
    });
  });

  describe('(4) nothing found', () => {
    it('→ npm', async () => {
      const above = markerAboveTmpdir();
      if (above !== undefined) {
        throw new Error(
          `case (4) cannot run on this machine: ${above} sits above os.tmpdir() and decides the walk`
        );
      }
      const folder = dir('talk');
      expect(await findPackageManager(folder)).toBe('npm');
      expect(await installCommand(folder)).toBe('npm install --save-dev eligian@^1.1');
    });
  });

  describe('(5) the folder already declares an admitting eligian range', () => {
    it.each([
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['bun.lock', 'bun'],
      ['package-lock.json', 'npm'],
    ] as const)(
      '^1.1.0 in devDependencies with %s → the plain %s install',
      async (lockfile, manager) => {
        write(lockfile, '');
        write('package.json', JSON.stringify({ devDependencies: { eligian: '^1.1.0' } }));
        expect(await installCommand(root)).toBe(INSTALL[manager]);
      }
    );

    it('^1.1.0 in dependencies → pnpm install', async () => {
      write('pnpm-lock.yaml', '');
      write('package.json', JSON.stringify({ dependencies: { eligian: '^1.1.0' } }));
      expect(await installCommand(root)).toBe('pnpm install');
    });

    it.each(['^1.0.0', '>=1.1', 'latest'])('%s → pnpm install', async range => {
      write('pnpm-lock.yaml', '');
      write('package.json', JSON.stringify({ devDependencies: { eligian: range } }));
      expect(await installCommand(root)).toBe('pnpm install');
    });
  });

  describe('(6) a declaration that does not admit 1.1 gets the add command', () => {
    it.each([
      ['1.0.3', { devDependencies: { eligian: '1.0.3' } }],
      ['no eligian key', { devDependencies: { other: '^1.0.0' } }],
      ['abc', { devDependencies: { eligian: 'abc' } }],
      ['workspace:*', { devDependencies: { eligian: 'workspace:*' } }],
      ['file:../x', { dependencies: { eligian: 'file:../x' } }],
    ])('%s → pnpm add -D eligian@^1.1', async (_name, manifest) => {
      write('pnpm-lock.yaml', '');
      write('package.json', JSON.stringify(manifest));
      expect(await installCommand(root)).toBe('pnpm add -D eligian@^1.1');
    });
  });
});

describe('admitsMinimum', () => {
  it.each(['^1.1.0', '^1.0.0', '>=1.1', '*', '1.x', 'latest', '^0.9.0 || ^1.2.0'])(
    '%s admits 1.1',
    range => {
      expect(admitsMinimum(range)).toBe(true);
    }
  );

  it.each(['1.0.3', '~1.0.3', '<1.1.0', 'workspace:*', 'file:../x', 'link:../x', 'abc', undefined])(
    '%s does not admit 1.1',
    range => {
      expect(admitsMinimum(range)).toBe(false);
    }
  );
});
