/**
 * The Eligian MCP server registration (spec 058 phase 4): the manifest
 * contributes the provider, its settings and the activation events that let
 * the extension register the server before the first chat request; the
 * provider returns one stdio definition per trusted folder with a usable
 * workspace-local `eligian` install and no server the user configured.
 *
 * The `vscode` module is a per-file fake (the shared harness of the provider
 * tasks); folders are real temp dirs.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => unknown;

interface FakeUri {
  readonly scheme: string;
  readonly fsPath: string;
  readonly path: string;
}

interface FakeFolder {
  readonly uri: FakeUri;
  readonly name: string;
  readonly index: number;
}

interface FakeChannel {
  readonly name: string;
  readonly appendLine: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
}

type WatcherEvent = 'create' | 'change' | 'delete';

interface FakeWatcher {
  readonly pattern: { base: FakeUri; pattern: string };
  readonly listeners: Record<WatcherEvent, Listener[]>;
  fire(kind: WatcherEvent, uri?: FakeUri): void;
  readonly dispose: ReturnType<typeof vi.fn>;
}

interface FakeDefinition {
  readonly label: string;
  readonly command: string;
  readonly args: string[];
  readonly env: Record<string, string | number | null>;
  readonly version: string | undefined;
  cwd?: FakeUri;
}

interface FakeTerminal {
  readonly options: unknown;
  readonly show: ReturnType<typeof vi.fn>;
  readonly sendText: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({
  workspace: {
    workspaceFolders: undefined as FakeFolder[] | undefined,
    isTrusted: true,
  },
  /** `${section}.${key}` → value, for every scope. */
  settings: {} as Record<string, unknown>,
  /** folder fsPath → `${section}.${key}` → value (wins over `settings`). */
  folderSettings: {} as Record<string, Record<string, unknown>>,
  /** `mcp.servers` per configuration level. */
  levels: {
    global: undefined as unknown,
    workspace: undefined as unknown,
    folder: {} as Record<string, unknown>,
  },
  globalReads: 0,
  configurationListeners: [] as Listener[],
  foldersListeners: [] as Listener[],
  trustListeners: [] as Listener[],
  watchers: [] as FakeWatcher[],
  findFiles: [] as FakeUri[],
  choice: undefined as string | undefined,
  showInformationMessage: vi.fn(),
  terminals: [] as FakeTerminal[],
  createTerminal: vi.fn(),
  channels: new Map<string, FakeChannel>(),
  createOutputChannel: vi.fn(),
  emitters: [] as { fires: number; dispose: ReturnType<typeof vi.fn> }[],
  /** Every definition built in this file, with the command setting in force at the time. */
  definitions: [] as { definition: FakeDefinition; expectedCommand: string }[],
  registrations: [] as { id: string; provider: any; dispose: ReturnType<typeof vi.fn> }[],
  lm: {} as { registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => unknown },
  /** `vscode.cursor`: the Cursor tests put their fake `mcp` API here (plan P2). */
  cursor: {} as { mcp?: Record<string, unknown> },
  /** Every path read through node:fs/promises (readFile / stat / access). */
  reads: [] as string[],
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const record =
    <F extends (...args: any[]) => any>(fn: F) =>
    (...args: Parameters<F>): ReturnType<F> => {
      h.reads.push(String(args[0]));
      return fn(...args);
    };
  const readFile = record(actual.readFile);
  const stat = record(actual.stat);
  const access = record(actual.access);
  return { ...actual, readFile, stat, access, default: { ...actual, readFile, stat, access } };
});

vi.mock('vscode', async () => {
  const nodePath = await import('node:path');
  const disposable = () => ({ dispose: vi.fn() });
  const file = (p: string) => ({ scheme: 'file', fsPath: p, path: p.replace(/\\/g, '/') });
  const scopePath = (scope: any): string | undefined => scope?.uri?.fsPath ?? scope?.fsPath;
  const getConfiguration = (section: string, scope?: any) => {
    const folderPath = scopePath(scope);
    return {
      get: (key: string, def?: unknown) => {
        const full = `${section}.${key}`;
        const own = folderPath === undefined ? undefined : h.folderSettings[folderPath];
        if (own && full in own) return own[full];
        return full in h.settings ? h.settings[full] : def;
      },
      inspect: (key: string) => {
        if (`${section}.${key}` !== 'mcp.servers') return undefined;
        return {
          key: 'mcp.servers',
          get globalValue() {
            h.globalReads++;
            return h.levels.global;
          },
          workspaceValue: h.levels.workspace,
          workspaceFolderValue: folderPath === undefined ? undefined : h.levels.folder[folderPath],
        };
      },
    };
  };
  const capture = (list: Listener[]) => (listener: Listener) => {
    list.push(listener);
    return disposable();
  };
  return {
    Uri: {
      file,
      joinPath: (base: { fsPath: string }, ...segments: string[]) =>
        file(nodePath.join(base.fsPath, ...segments)),
    },
    RelativePattern: class {
      constructor(
        public base: unknown,
        public pattern: string
      ) {}
    },
    McpStdioServerDefinition: class {
      cwd?: unknown;
      constructor(
        public label: string,
        public command: string,
        public args: string[] = [],
        public env: Record<string, string | number | null> = {},
        public version?: string
      ) {
        const setting = h.settings['eligian.mcp.command'];
        const trimmed = typeof setting === 'string' ? setting.trim() : '';
        h.definitions.push({ definition: this as any, expectedCommand: trimmed || 'node' });
      }
    },
    EventEmitter: class {
      private listeners: Listener[] = [];
      fires = 0;
      dispose = vi.fn();
      constructor() {
        h.emitters.push(this);
      }
      event = (listener: Listener) => {
        this.listeners.push(listener);
        return disposable();
      };
      fire(value?: unknown) {
        this.fires++;
        for (const listener of this.listeners) listener(value);
      }
    },
    workspace: {
      get workspaceFolders() {
        return h.workspace.workspaceFolders;
      },
      get isTrusted() {
        return h.workspace.isTrusted;
      },
      getConfiguration,
      onDidChangeConfiguration: capture(h.configurationListeners),
      onDidChangeWorkspaceFolders: capture(h.foldersListeners),
      onDidGrantWorkspaceTrust: capture(h.trustListeners),
      createFileSystemWatcher: (pattern: any) => {
        const watcher: FakeWatcher = {
          pattern,
          listeners: { create: [], change: [], delete: [] },
          fire(kind, uri) {
            for (const listener of this.listeners[kind]) listener(uri);
          },
          dispose: vi.fn(),
        };
        const on = (kind: WatcherEvent) => (listener: Listener) => {
          watcher.listeners[kind].push(listener);
          return disposable();
        };
        h.watchers.push(watcher);
        return {
          onDidCreate: on('create'),
          onDidChange: on('change'),
          onDidDelete: on('delete'),
          dispose: watcher.dispose,
        };
      },
      findFiles: async () => h.findFiles,
    },
    window: {
      showInformationMessage: (...args: unknown[]) => h.showInformationMessage(...args),
      createTerminal: (...args: unknown[]) => h.createTerminal(...args),
      createOutputChannel: (...args: unknown[]) => h.createOutputChannel(...args),
    },
    lm: h.lm,
    cursor: h.cursor,
  };
});

import {
  computeServerSpecs,
  DEBOUNCE_MS,
  DISMISSED_KEY,
  FOLLOW_UP_MS,
  installPromptSettled,
  PROVIDER_ID,
  registerEligianMcpServer,
} from '../mcp/server-definition-provider.js';

const manifestPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../package.json'
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-'));
  tempDirs.push(dir);
  return dir;
};

const fileUri = (p: string): FakeUri => ({ scheme: 'file', fsPath: p, path: p });

interface FolderSetup {
  /** Text of node_modules/eligian/package.json; `null` = no file. */
  readonly manifest?: string | null;
  /** Shorthand for a manifest `{"version": …}`. */
  readonly version?: string;
  /** Writes node_modules/eligian/bin/cli.js (default true). */
  readonly bin?: boolean;
  /** Text of .vscode/mcp.json, if any. */
  readonly mcpJson?: string;
}

/** A real folder on disk; `name` makes a named subdirectory of a fresh temp dir. */
const makeFolder = (setup: FolderSetup = {}, name?: string): string => {
  const folder = name ? path.join(tempDir(), name) : tempDir();
  const packageDir = path.join(folder, 'node_modules', 'eligian');
  fs.mkdirSync(packageDir, { recursive: true });
  const text =
    setup.manifest !== undefined
      ? setup.manifest
      : JSON.stringify({ name: 'eligian', version: setup.version ?? '1.1.0' });
  if (text !== null) fs.writeFileSync(path.join(packageDir, 'package.json'), text);
  if (setup.bin ?? true) {
    fs.mkdirSync(path.join(packageDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'bin', 'cli.js'), '');
  }
  if (setup.mcpJson !== undefined) {
    fs.mkdirSync(path.join(folder, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(folder, '.vscode', 'mcp.json'), setup.mcpJson);
  }
  return folder;
};

const openFolders = (...folders: (string | FakeUri)[]): void => {
  h.workspace.workspaceFolders = folders.map((folder, index) => {
    const uri = typeof folder === 'string' ? fileUri(folder) : folder;
    return { uri, name: path.basename(uri.fsPath), index };
  });
};

const cliOf = (folder: string): string =>
  path.join(folder, 'node_modules', 'eligian', 'bin', 'cli.js');

const fakeContext = () => {
  const state = new Map<string, unknown>();
  return {
    subscriptions: [] as { dispose(): unknown }[],
    workspaceState: {
      get: (key: string) => state.get(key),
      update: async (key: string, value: unknown) => {
        state.set(key, value);
      },
    },
  } as any;
};

/** Registers through the fake `lm` and returns the provider it captured. */
const register = () => {
  const disposable = registerEligianMcpServer(fakeContext());
  const registration = h.registrations[h.registrations.length - 1];
  if (!registration) throw new Error('no provider was registered');
  return { disposable, registration, provider: registration.provider };
};

const provide = async (): Promise<FakeDefinition[]> => {
  const { provider } = register();
  return (await provider.provideMcpServerDefinitions({ isCancellationRequested: false })) ?? [];
};

const servers = (entries: Record<string, unknown>) => JSON.stringify({ servers: entries });

/** SC-020 (a)–(e): what makes a `servers` object hold an Eligian server. */
const ELIGIAN_SERVERS: readonly [string, Record<string, unknown>][] = [
  ['(a) the eligian key', { eligian: { command: 'node', args: ['x.js'] } }],
  [
    '(b) cli.js with \\ then mcp',
    {
      'eligian-mcp': {
        command: 'node',
        args: ['C:\\p\\node_modules\\eligian\\bin\\cli.js', 'mcp'],
      },
    },
  ],
  [
    '(c) cli.js with / then mcp',
    { 'eligian-mcp': { command: 'node', args: ['C:/p/node_modules/eligian/bin/cli.js', 'mcp'] } },
  ],
  ['(d) npx eligian mcp', { x: { command: 'npx', args: ['eligian', 'mcp'] } }],
  ['(e) npx eligian@1.2.0 mcp', { x: { command: 'npx', args: ['eligian@1.2.0', 'mcp'] } }],
];

/** Servers that are not an Eligian server: the provider still returns one definition. */
const OTHER_SERVERS: readonly [string, Record<string, unknown>][] = [
  [
    'cli.js without mcp after it',
    {
      'eligian-mcp': {
        command: 'node',
        args: ['C:\\p\\node_modules\\eligian\\bin\\cli.js', 'check'],
      },
    },
  ],
  ['eligian-tools as an arg', { x: { command: 'npx', args: ['eligian-tools', 'mcp'] } }],
  ['an unrelated server', { other: { command: 'python', args: ['-m', 'my_server'] } }],
];

beforeEach(() => {
  h.workspace.workspaceFolders = undefined;
  h.workspace.isTrusted = true;
  h.settings = {};
  h.folderSettings = {};
  h.levels.global = undefined;
  h.levels.workspace = undefined;
  h.levels.folder = {};
  h.globalReads = 0;
  h.configurationListeners.length = 0;
  h.foldersListeners.length = 0;
  h.trustListeners.length = 0;
  h.watchers.length = 0;
  h.findFiles = [];
  h.choice = undefined;
  h.terminals.length = 0;
  h.emitters.length = 0;
  h.registrations.length = 0;
  h.reads.length = 0;
  for (const channel of h.channels.values()) {
    channel.appendLine.mockClear();
    channel.dispose.mockClear();
  }
  h.showInformationMessage.mockReset();
  h.showInformationMessage.mockImplementation(async () => h.choice);
  h.createTerminal.mockReset();
  h.createTerminal.mockImplementation((options: unknown) => {
    const terminal = { options, show: vi.fn(), sendText: vi.fn() };
    h.terminals.push(terminal);
    return terminal;
  });
  h.createOutputChannel.mockReset();
  h.createOutputChannel.mockImplementation((name: string) => {
    let channel = h.channels.get(name);
    if (!channel) {
      channel = { name, appendLine: vi.fn(), dispose: vi.fn() };
      h.channels.set(name, channel);
    }
    return channel;
  });
  delete h.cursor.mcp;
  h.lm.registerMcpServerDefinitionProvider = (id: string, provider: unknown) => {
    const registration = { id, provider, dispose: vi.fn() };
    h.registrations.push(registration);
    return registration;
  };
});

afterEach(async () => {
  // A prompt check started by this test must not land in the next one's counts.
  await installPromptSettled();
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('manifest', () => {
  it('activates on the language, the MCP collection and an Eligian workspace', () => {
    expect(manifest.activationEvents).toEqual(
      expect.arrayContaining([
        'onLanguage:eligian',
        'onMcpCollection:eligian.mcp',
        'workspaceContains:node_modules/eligian/package.json',
        'workspaceContains:**/*.eligian',
      ])
    );
  });

  it('contributes the eligian.mcp server definition provider', () => {
    expect(manifest.contributes.mcpServerDefinitionProviders).toEqual([
      { id: 'eligian.mcp', label: 'Eligian' },
    ]);
  });

  it('contributes eligian.mcp.enabled and eligian.mcp.command', () => {
    const properties = manifest.contributes.configuration.properties;
    expect(properties['eligian.mcp.enabled']).toMatchObject({
      type: 'boolean',
      default: true,
      scope: 'resource',
    });
    expect(properties['eligian.mcp.command']).toMatchObject({
      type: 'string',
      default: 'node',
      scope: 'machine-overridable',
    });
  });

  it('restricts eligian.mcp.command in untrusted workspaces and says so', () => {
    const untrusted = manifest.capabilities.untrustedWorkspaces;
    expect(untrusted.restrictedConfigurations).toContain('eligian.mcp.command');
    expect(untrusted.description).toMatch(/MCP server/);
  });
});

describe('registration', () => {
  it('registers one provider under PROVIDER_ID, the id the manifest contributes', () => {
    const { disposable, registration } = register();
    expect(h.registrations).toHaveLength(1);
    expect(PROVIDER_ID).toBe('eligian.mcp');
    expect(registration.id).toBe(PROVIDER_ID);
    expect(manifest.contributes.mcpServerDefinitionProviders[0].id).toBe(PROVIDER_ID);
    expect(registration.provider.onDidChangeMcpServerDefinitions).toBeTypeOf('function');

    disposable.dispose();
    expect(registration.dispose).toHaveBeenCalledTimes(1);
    expect(h.emitters).toHaveLength(1);
    expect(h.emitters[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('registers nothing on a host without lm.registerMcpServerDefinitionProvider', () => {
    h.lm.registerMcpServerDefinitionProvider = undefined;
    const disposable = registerEligianMcpServer(fakeContext());
    expect(h.registrations).toHaveLength(0);
    expect(() => disposable.dispose()).not.toThrow();
  });

  it('US1-1: a trusted folder with eligian 1.1.0 gets one node definition', async () => {
    const folder = makeFolder({ version: '1.1.0' });
    openFolders(folder);

    const definitions = await provide();

    expect(definitions).toHaveLength(1);
    const [definition] = definitions;
    expect(definition.label).toBe('Eligian');
    expect(definition.command).toBe('node');
    expect(definition.args).toEqual([cliOf(folder), 'mcp']);
    expect(definition.cwd?.fsPath).toBe(folder);
    expect(definition.cwd?.scheme).toBe('file');
    expect(definition.env).toEqual({});
    expect(definition.version).toBe('1.1.0');
    expect(h.showInformationMessage).not.toHaveBeenCalled();
  });
});

describe('version gate', () => {
  it.each(['1.1.0', '1.1.0-beta.1', '1.2.3', '2.0.0'])('eligian %s → 1 definition', async v => {
    openFolders(makeFolder({ version: v }));
    const definitions = await provide();
    expect(definitions).toHaveLength(1);
    expect(definitions[0].version).toBe(v);
  });

  it.each<[string, FolderSetup]>([
    ['eligian 1.0.9', { version: '1.0.9' }],
    ['eligian 0.9.0', { version: '0.9.0' }],
    ['a package.json without version', { manifest: '{"name":"eligian"}' }],
    ['version "abc"', { version: 'abc' }],
    ['no package.json', { manifest: null }],
    ['no bin/cli.js', { version: '1.1.0', bin: false }],
  ])('%s → 0 definitions', async (_name, setup) => {
    openFolders(makeFolder(setup));
    expect(await provide()).toEqual([]);
  });

  it('an untrusted workspace → 0 definitions', async () => {
    openFolders(makeFolder());
    h.workspace.isTrusted = false;
    expect(await provide()).toEqual([]);
  });

  it('two qualifying folders → two definitions, each labelled with its folder', async () => {
    const talk = makeFolder({}, 'talk');
    const deck = makeFolder({ version: '1.2.0' }, 'deck');
    openFolders(talk, deck);

    const definitions = await provide();

    expect(definitions.map(d => d.label)).toEqual(['Eligian (talk)', 'Eligian (deck)']);
    expect(definitions.map(d => d.cwd?.fsPath)).toEqual([talk, deck]);
    expect(definitions.map(d => d.args[0])).toEqual([cliOf(talk), cliOf(deck)]);
    expect(definitions.map(d => d.version)).toEqual(['1.1.0', '1.2.0']);
  });

  it('a folder whose uri is not a file uri is skipped', async () => {
    const real = makeFolder({}, 'real');
    const remote = makeFolder({}, 'remote');
    openFolders({ scheme: 'vscode-vfs', fsPath: remote, path: remote }, real);

    const definitions = await provide();

    expect(definitions).toHaveLength(1);
    expect(definitions[0].label).toBe('Eligian');
    expect(definitions[0].cwd?.fsPath).toBe(real);
  });
});

describe('setting', () => {
  it('eligian.mcp.enabled false for the folder → 0 definitions', async () => {
    const folder = makeFolder();
    openFolders(folder);
    h.folderSettings[folder] = { 'eligian.mcp.enabled': false };
    expect(await provide()).toEqual([]);
  });

  it('disabled for one of two folders → the other alone, without a suffix', async () => {
    const talk = makeFolder({}, 'talk');
    const deck = makeFolder({}, 'deck');
    openFolders(talk, deck);
    h.folderSettings[talk] = { 'eligian.mcp.enabled': false };

    const definitions = await provide();

    expect(definitions.map(d => [d.label, d.cwd?.fsPath])).toEqual([['Eligian', deck]]);
  });

  it('a blank eligian.mcp.command → node', async () => {
    openFolders(makeFolder());
    h.settings['eligian.mcp.command'] = '  ';
    const definitions = await provide();
    expect(definitions.map(d => d.command)).toEqual(['node']);
  });

  it('eligian.mcp.command C:\\node\\node.exe → that command', async () => {
    openFolders(makeFolder());
    h.settings['eligian.mcp.command'] = 'C:\\node\\node.exe';
    const definitions = await provide();
    expect(definitions.map(d => d.command)).toEqual(['C:\\node\\node.exe']);
  });
});

describe('user-configured server', () => {
  it('SC-003 (1): .vscode/mcp.json with servers.eligian → 0 definitions', async () => {
    openFolders(
      makeFolder({
        mcpJson: servers({
          eligian: { command: 'node', args: ['node_modules/eligian/bin/cli.js', 'mcp'] },
        }),
      })
    );
    expect(await provide()).toEqual([]);
  });

  it('SC-003 (3): an unparsable .vscode/mcp.json → 1 definition and one log line', async () => {
    openFolders(makeFolder({ mcpJson: '{' }));

    const definitions = await provide();

    expect(definitions).toHaveLength(1);
    const channel = h.channels.get('Eligian MCP');
    expect(channel).toBeDefined();
    expect(channel?.appendLine).toHaveBeenCalledTimes(1);
  });

  it.each(ELIGIAN_SERVERS)('SC-020 %s in .vscode/mcp.json → 0 definitions', async (_n, entries) => {
    openFolders(makeFolder({ mcpJson: servers(entries) }));
    expect(await provide()).toEqual([]);
  });

  it.each(ELIGIAN_SERVERS)(
    'SC-020 (f) %s in the workspace mcp configuration → 0 definitions',
    async (_n, entries) => {
      openFolders(makeFolder({}, 'talk'), makeFolder({}, 'deck'));
      h.levels.workspace = entries;
      expect(await provide()).toEqual([]);
    }
  );

  it.each(ELIGIAN_SERVERS)(
    'SC-020 (f) %s in the folder-level mcp configuration → 0 for that folder',
    async (_n, entries) => {
      const talk = makeFolder({}, 'talk');
      const deck = makeFolder({}, 'deck');
      openFolders(talk, deck);
      h.levels.folder[talk] = entries;

      const definitions = await provide();

      expect(definitions.map(d => [d.label, d.cwd?.fsPath])).toEqual([['Eligian', deck]]);
    }
  );

  it('an Eligian server in the user settings (globalValue) is never read → 1 definition', async () => {
    openFolders(makeFolder());
    h.levels.global = { eligian: { command: 'node', args: ['cli.js', 'mcp'] } };

    expect(await provide()).toHaveLength(1);
    expect(h.globalReads).toBe(0);
  });

  it.each(OTHER_SERVERS)('%s in .vscode/mcp.json → 1 definition', async (_n, entries) => {
    openFolders(makeFolder({ mcpJson: servers(entries) }));
    expect(await provide()).toHaveLength(1);
  });

  it.each(OTHER_SERVERS)(
    '%s in the workspace mcp configuration → 1 definition',
    async (_n, entries) => {
      openFolders(makeFolder());
      h.levels.workspace = entries;
      expect(await provide()).toHaveLength(1);
    }
  );

  it('the user-profile mcp.json is never read → 1 definition', async () => {
    const userDir = tempDir();
    const eligianFile = servers({ eligian: { command: 'npx', args: ['eligian', 'mcp'] } });
    fs.writeFileSync(path.join(userDir, 'mcp.json'), eligianFile);
    fs.mkdirSync(path.join(userDir, 'Code', 'User'), { recursive: true });
    fs.writeFileSync(path.join(userDir, 'Code', 'User', 'mcp.json'), eligianFile);
    vi.stubEnv('APPDATA', userDir);
    vi.stubEnv('HOME', userDir);
    vi.stubEnv('USERPROFILE', userDir);
    openFolders(makeFolder());

    const definitions = await provide();

    expect(definitions).toHaveLength(1);
    expect(h.reads.length).toBeGreaterThan(0);
    const underUserDir = h.reads.filter(p => {
      const resolved = path.resolve(p);
      return resolved === userDir || resolved.startsWith(userDir + path.sep);
    });
    expect(underUserDir).toEqual([]);
  });
});

describe('change events', () => {
  const live: { dispose(): unknown }[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const disposable of live.splice(0)) disposable.dispose();
    vi.useRealTimers();
  });

  /** Registers, subscribes to the provider's change event and counts its fires. */
  const start = () => {
    const disposable = registerEligianMcpServer(fakeContext());
    live.push(disposable);
    const registration = h.registrations[h.registrations.length - 1];
    if (!registration) throw new Error('no provider was registered');
    const { provider } = registration;
    let events = 0;
    provider.onDidChangeMcpServerDefinitions(() => {
      events++;
    });
    return {
      disposable,
      events: () => events,
      definitions: async (): Promise<FakeDefinition[]> =>
        (await provider.provideMcpServerDefinitions({ isCancellationRequested: false })) ?? [],
    };
  };

  const inFolder = (folder: string) => (watcher: FakeWatcher) => {
    const base = watcher.pattern.base.fsPath;
    return base === folder || base.startsWith(folder + path.sep);
  };

  const patternsOf = (folder: string) =>
    h.watchers.filter(inFolder(folder)).map(w => [w.pattern.base.fsPath, w.pattern.pattern]);

  const expectedPatterns = (folder: string) => [
    [path.join(folder, 'node_modules', 'eligian'), 'package.json'],
    [path.join(folder, 'node_modules'), 'eligian'],
    [folder, 'node_modules'],
    [path.join(folder, '.vscode'), 'mcp.json'],
    [folder, '.vscode'],
  ];

  const packageWatcher = (folder: string): FakeWatcher => {
    const base = path.join(folder, 'node_modules', 'eligian');
    const watcher = h.watchers.find(
      w => w.pattern.base.fsPath === base && w.pattern.pattern === 'package.json'
    );
    if (!watcher) throw new Error(`no package.json watcher for ${folder}`);
    return watcher;
  };

  const changeConfiguration = (affected: string) => {
    for (const listener of h.configurationListeners) {
      listener({ affectsConfiguration: (section: string) => section === affected });
    }
  };

  /** Lets an in-flight follow-up check (real fs reads) finish before a negative assertion. */
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(0);
    await computeServerSpecs();
    await computeServerSpecs();
  };

  it('watches five non-recursive patterns per folder', () => {
    const talk = makeFolder({}, 'talk');
    const deck = makeFolder({}, 'deck');
    openFolders(talk, deck);

    start();

    expect(DEBOUNCE_MS).toBe(500);
    expect(patternsOf(talk)).toEqual(expectedPatterns(talk));
    expect(patternsOf(deck)).toEqual(expectedPatterns(deck));
    expect(h.watchers).toHaveLength(10);
    for (const watcher of h.watchers) expect(watcher.pattern.pattern).not.toContain('**');
  });

  it('each watcher event and a folders change fire one event after 500 ms', async () => {
    const folder = makeFolder();
    openFolders(folder);
    const { events, definitions } = start();
    expect(await definitions()).toHaveLength(1);

    const watchers = h.watchers.filter(inFolder(folder));
    expect(watchers).toHaveLength(5);
    let expected = 0;
    for (const watcher of watchers) {
      for (const kind of ['create', 'change', 'delete'] as const) {
        const what = `${watcher.pattern.pattern} ${kind}`;
        watcher.fire(kind);
        vi.advanceTimersByTime(499);
        expect(events(), `${what} at 499 ms`).toBe(expected);
        vi.advanceTimersByTime(1);
        expected++;
        expect(events(), `${what} at 500 ms`).toBe(expected);
        vi.advanceTimersByTime(FOLLOW_UP_MS);
        expect(events(), `${what} follow-up`).toBe(expected);
      }
    }
    await settle();
    expect(events()).toBe(expected);

    for (const listener of h.foldersListeners) listener({ added: [], removed: [] });
    vi.advanceTimersByTime(499);
    expect(events()).toBe(expected);
    vi.advanceTimersByTime(1);
    expect(events()).toBe(expected + 1);
  });

  it('a config change, a watcher change and a trust grant within 500 ms fire once', async () => {
    const folder = makeFolder();
    openFolders(folder);
    const { events, definitions } = start();
    await definitions();

    changeConfiguration('eligian.mcp');
    vi.advanceTimersByTime(200);
    packageWatcher(folder).fire('change');
    vi.advanceTimersByTime(200);
    for (const listener of h.trustListeners) listener();
    vi.advanceTimersByTime(499);
    expect(events()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(events()).toBe(1);

    vi.advanceTimersByTime(FOLLOW_UP_MS);
    await settle();
    expect(events()).toBe(1);
  });

  it('an added folder gets watchers, a removed one is disposed', () => {
    const f1 = makeFolder({}, 'one');
    const f2 = makeFolder({}, 'two');
    openFolders(f1);
    start();
    const oldWatchers = h.watchers.filter(inFolder(f1));
    expect(oldWatchers).toHaveLength(5);
    expect(patternsOf(f2)).toEqual([]);

    openFolders(f2);
    const [added] = h.workspace.workspaceFolders ?? [];
    for (const listener of h.foldersListeners) {
      listener({ added: [added], removed: [{ uri: fileUri(f1), name: 'one', index: 0 }] });
    }

    expect(patternsOf(f2)).toEqual(expectedPatterns(f2));
    for (const watcher of oldWatchers) expect(watcher.dispose).toHaveBeenCalledTimes(1);
    for (const watcher of h.watchers.filter(inFolder(f2))) {
      expect(watcher.dispose).not.toHaveBeenCalled();
    }
  });

  it('a change of the mcp configuration fires once', () => {
    openFolders(makeFolder());
    const { events } = start();

    changeConfiguration('mcp');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(events()).toBe(1);

    changeConfiguration('eligian.mcp');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(events()).toBe(2);

    changeConfiguration('editor');
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    expect(events()).toBe(2);
  });

  it('the follow-up check catches a cli.js written after the first event', async () => {
    const folder = makeFolder({ version: '1.1.0', bin: false });
    openFolders(folder);
    const { events, definitions } = start();

    packageWatcher(folder).fire('create');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(events()).toBe(1);
    expect(await definitions()).toEqual([]);

    const bin = path.join(folder, 'node_modules', 'eligian', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'cli.js'), '');
    await vi.advanceTimersByTimeAsync(FOLLOW_UP_MS);
    await vi.waitFor(() => expect(events()).toBe(2));
    await settle();
    expect(events()).toBe(2);

    const after = await definitions();
    expect(after).toHaveLength(1);
    expect(after[0].args).toEqual([cliOf(folder), 'mcp']);
  });

  it('US1-2: a version change fires and the next definition carries it', async () => {
    const folder = makeFolder({ version: '1.1.0' });
    openFolders(folder);
    const { events, definitions } = start();
    expect((await definitions()).map(d => d.version)).toEqual(['1.1.0']);

    fs.writeFileSync(
      path.join(folder, 'node_modules', 'eligian', 'package.json'),
      JSON.stringify({ name: 'eligian', version: '1.2.0' })
    );
    packageWatcher(folder).fire('change');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(events()).toBe(1);

    expect((await definitions()).map(d => d.version)).toEqual(['1.2.0']);
  });

  it('SC-002: toggling eligian.mcp.enabled fires exactly once each way', async () => {
    const folder = makeFolder();
    openFolders(folder);
    const { events, definitions } = start();
    expect(await definitions()).toHaveLength(1);

    h.folderSettings[folder] = { 'eligian.mcp.enabled': false };
    changeConfiguration('eligian.mcp');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(events()).toBe(1);
    expect(await definitions()).toEqual([]);

    h.folderSettings[folder] = { 'eligian.mcp.enabled': true };
    changeConfiguration('eligian.mcp');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(events()).toBe(2);
    expect(await definitions()).toHaveLength(1);

    vi.advanceTimersByTime(FOLLOW_UP_MS);
    await settle();
    expect(events()).toBe(2);
  });

  it('SC-005: granting trust fires once', async () => {
    openFolders(makeFolder());
    h.workspace.isTrusted = false;
    const { events, definitions } = start();
    expect(await definitions()).toEqual([]);

    h.workspace.isTrusted = true;
    for (const listener of h.trustListeners) listener();
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(events()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(events()).toBe(1);
    expect(await definitions()).toHaveLength(1);
  });

  it('disposing clears the pending timers and disposes every watcher', () => {
    openFolders(makeFolder());
    const { disposable, events } = start();
    const watchers = [...h.watchers];
    expect(watchers).toHaveLength(5);

    watchers[0].fire('change');
    disposable.dispose();
    vi.advanceTimersByTime(FOLLOW_UP_MS * 2);

    expect(events()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    for (const watcher of watchers) expect(watcher.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('install prompt', () => {
  const live: { dispose(): unknown }[] = [];

  afterEach(() => {
    for (const disposable of live.splice(0)) disposable.dispose();
    vi.useRealTimers();
  });

  const OLD = { version: '1.0.3' } as const;
  const oneEligianFile = (folder: string) => {
    h.findFiles = [fileUri(path.join(folder, 'talk.eligian'))];
  };

  /** Activates and waits for the activation-time check (and an Install it ran). */
  const activate = async (context = fakeContext()) => {
    live.push(registerEligianMcpServer(context));
    await installPromptSettled();
    const registration = h.registrations[h.registrations.length - 1];
    if (!registration) throw new Error('no provider was registered');
    return { context, provider: registration.provider };
  };

  /** (4): providing the definitions never shows the notification. */
  const expectProvideSilent = async (provider: any) => {
    const before = h.showInformationMessage.mock.calls.length;
    await provider.provideMcpServerDefinitions({ isCancellationRequested: false });
    await installPromptSettled();
    expect(h.showInformationMessage).toHaveBeenCalledTimes(before);
  };

  const sent = () => h.terminals.flatMap(t => t.sendText.mock.calls.map(call => call[0]));

  it('(1) a folder with a .eligian file and eligian 1.0.3 gets one notification', async () => {
    const folder = makeFolder(OLD, 'talk');
    openFolders(folder);
    oneEligianFile(folder);

    const { provider } = await activate();

    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);
    const [message, ...items] = h.showInformationMessage.mock.calls[0];
    expect(message).toContain('1.0.3');
    expect(message).toContain('1.1 or later');
    expect(message).toContain('talk');
    expect(items).toEqual(['Install', "Don't Ask Again"]);
    expect(h.createTerminal).not.toHaveBeenCalled();
    await expectProvideSilent(provider);
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm add -D eligian@^1.1'],
    ['yarn.lock', 'yarn add -D eligian@^1.1'],
    ['bun.lock', 'bun add -d eligian@^1.1'],
    [undefined, 'npm install --save-dev eligian@^1.1'],
  ])('(2) Install with %s runs %s in the folder', async (lockfile, command) => {
    const folder = makeFolder(OLD);
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'talk' }));
    if (lockfile) fs.writeFileSync(path.join(folder, lockfile), '');
    openFolders(folder);
    oneEligianFile(folder);
    h.choice = 'Install';

    const { provider } = await activate();

    expect(h.createTerminal).toHaveBeenCalledTimes(1);
    expect(h.createTerminal).toHaveBeenCalledWith({
      name: 'Eligian: install',
      cwd: expect.objectContaining({ fsPath: folder }),
    });
    expect(h.terminals[0].show).toHaveBeenCalledTimes(1);
    expect(sent()).toEqual([command]);
    await expectProvideSilent(provider);
  });

  it("(3) Don't Ask Again is remembered in workspaceState", async () => {
    const folder = makeFolder(OLD);
    openFolders(folder);
    oneEligianFile(folder);
    h.choice = "Don't Ask Again";
    const context = fakeContext();
    const update = vi.spyOn(context.workspaceState, 'update');

    await activate(context);

    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(DISMISSED_KEY).toBe('eligian.mcp.installPromptDismissed');
    expect(update).toHaveBeenCalledWith(DISMISSED_KEY, true);
    expect(h.createTerminal).not.toHaveBeenCalled();

    h.showInformationMessage.mockClear();
    const { provider } = await activate(context);
    expect(h.showInformationMessage).not.toHaveBeenCalled();
    await expectProvideSilent(provider);
  });

  it.each<[string, (folder: string) => void]>([
    [
      'eligian.mcp.enabled is false',
      () => {
        h.settings['eligian.mcp.enabled'] = false;
      },
    ],
    [
      'the workspace is untrusted',
      () => {
        h.workspace.isTrusted = false;
      },
    ],
    [
      '.vscode/mcp.json holds an Eligian server',
      folder => {
        fs.mkdirSync(path.join(folder, '.vscode'), { recursive: true });
        fs.writeFileSync(path.join(folder, '.vscode', 'mcp.json'), servers({ eligian: {} }));
      },
    ],
    [
      'the workspace mcp configuration holds one',
      () => {
        h.levels.workspace = { x: { command: 'npx', args: ['eligian', 'mcp'] } };
      },
    ],
    [
      'the folder mcp configuration holds one',
      folder => {
        h.levels.folder[folder] = { eligian: {} };
      },
    ],
  ])('(5) no notification when %s', async (_, arrange) => {
    const folder = makeFolder(OLD);
    openFolders(folder);
    oneEligianFile(folder);
    arrange(folder);

    const { provider } = await activate();

    expect(h.showInformationMessage).not.toHaveBeenCalled();
    await expectProvideSilent(provider);
  });

  it('(5) no notification for a folder with neither .eligian files nor node_modules/eligian', async () => {
    openFolders(tempDir());
    const { provider } = await activate();
    expect(h.showInformationMessage).not.toHaveBeenCalled();
    await expectProvideSilent(provider);
  });

  it('(6) watcher and config changes after the first notification show no second one', async () => {
    vi.useFakeTimers();
    const folder = makeFolder(OLD);
    openFolders(folder);
    oneEligianFile(folder);
    const { provider } = await activate();
    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);

    h.watchers[0].fire('change');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await installPromptSettled();
    h.watchers[1].fire('create');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await installPromptSettled();
    for (const listener of h.configurationListeners) {
      listener({ affectsConfiguration: (section: string) => section === 'eligian.mcp' });
    }
    await vi.advanceTimersByTimeAsync(FOLLOW_UP_MS);
    await installPromptSettled();

    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);
    await expectProvideSilent(provider);
  });

  it('a watcher change runs the check: a folder that starts failing later is prompted', async () => {
    vi.useFakeTimers();
    const folder = makeFolder({ manifest: null });
    openFolders(folder);
    await activate();
    expect(h.showInformationMessage).not.toHaveBeenCalled();

    fs.writeFileSync(
      path.join(folder, 'node_modules', 'eligian', 'package.json'),
      JSON.stringify({ version: '1.0.3' })
    );
    h.watchers[0].fire('create');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await installPromptSettled();

    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(h.showInformationMessage.mock.calls[0][0]).toContain('1.0.3');
  });

  it('(7) two failing folders get one notification, for the first folder', async () => {
    const deck = makeFolder(OLD, 'deck');
    const talk = makeFolder(OLD, 'talk');
    openFolders(deck, talk);
    oneEligianFile(deck);
    h.choice = 'Install';

    const { provider } = await activate();

    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);
    const [message] = h.showInformationMessage.mock.calls[0];
    expect(message).toContain('deck');
    expect(message).not.toContain('talk');
    expect(h.createTerminal).toHaveBeenCalledTimes(1);
    expect(h.createTerminal.mock.calls[0][0].cwd.fsPath).toBe(deck);
    await expectProvideSilent(provider);
  });

  it('(8) an install too old, with no .eligian file, gets one notification naming it', async () => {
    openFolders(makeFolder(OLD));
    const { provider } = await activate();
    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(h.showInformationMessage.mock.calls[0][0]).toContain('1.0.3');
    await expectProvideSilent(provider);
  });

  it('(8) an unparsable install version, with no .eligian file, gets one notification', async () => {
    openFolders(makeFolder({ manifest: '{"version":"abc"}' }));
    const { provider } = await activate();
    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);
    await expectProvideSilent(provider);
  });

  it('SC-021: Install runs in the folder with the ancestor manager', async () => {
    const folder = makeFolder(OLD, path.join('packages', 'talk'));
    const root = path.dirname(path.dirname(folder));
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), '');
    openFolders(folder);
    oneEligianFile(folder);
    h.choice = 'Install';

    const { provider } = await activate();

    expect(h.createTerminal).toHaveBeenCalledTimes(1);
    const options = h.createTerminal.mock.calls[0][0];
    expect(options.cwd.fsPath).toBe(folder);
    expect(options.cwd.fsPath).not.toBe(root);
    expect(sent()).toEqual(['pnpm add -D eligian@^1.1']);
    await expectProvideSilent(provider);
  });
});

describe('Cursor branch', () => {
  const live: { dispose(): unknown }[] = [];

  afterEach(() => {
    for (const disposable of live.splice(0)) disposable.dispose();
    vi.useRealTimers();
  });

  /** Cursor's documented API (https://cursor.com/docs/context/mcp-extension-api, plan P2). */
  const installCursor = () => {
    const api = {
      registerServer: vi.fn(
        (_config: {
          name: string;
          server: { command: string; args: string[]; env: Record<string, string> };
        }) => {}
      ),
      unregisterServer: vi.fn((_serverName: string) => {}),
    };
    h.cursor.mcp = api;
    return api;
  };

  const activate = () => {
    const disposable = registerEligianMcpServer(fakeContext());
    live.push(disposable);
    return disposable;
  };

  const spec = (folder: string, name: string) => ({
    name,
    server: { command: 'node', args: [cliOf(folder), 'mcp'], env: {} },
  });

  it('(1) activation registers one server and no lm provider', async () => {
    const cursor = installCursor();
    const folder = makeFolder();
    openFolders(folder);

    activate();

    await vi.waitFor(() => expect(cursor.registerServer).toHaveBeenCalledTimes(1));
    expect(cursor.registerServer).toHaveBeenCalledWith(spec(folder, 'eligian'));
    expect(cursor.unregisterServer).not.toHaveBeenCalled();
    expect(h.registrations).toHaveLength(0);
  });

  it('(1) two qualifying folders register eligian-talk and eligian-deck', async () => {
    const cursor = installCursor();
    const talk = makeFolder({}, 'talk');
    const deck = makeFolder({}, 'deck');
    openFolders(talk, deck);

    activate();

    await vi.waitFor(() => expect(cursor.registerServer).toHaveBeenCalledTimes(2));
    expect(cursor.registerServer.mock.calls.map(call => call[0])).toEqual([
      spec(talk, 'eligian-talk'),
      spec(deck, 'eligian-deck'),
    ]);
    expect(h.registrations).toHaveLength(0);
  });

  it('(2) a version change unregisters the server, then registers the new one', async () => {
    vi.useFakeTimers();
    const cursor = installCursor();
    const folder = makeFolder({ version: '1.1.0' });
    openFolders(folder);
    activate();
    await vi.waitFor(() => expect(cursor.registerServer).toHaveBeenCalledTimes(1));
    const registered = cursor.registerServer.mock.invocationCallOrder[0];

    fs.writeFileSync(
      path.join(folder, 'node_modules', 'eligian', 'package.json'),
      JSON.stringify({ version: '1.2.0' })
    );
    for (const watcher of h.watchers) {
      if (watcher.pattern.pattern === 'package.json') watcher.fire('change');
    }
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    await vi.waitFor(() => expect(cursor.registerServer).toHaveBeenCalledTimes(2));
    expect(cursor.unregisterServer).toHaveBeenCalledTimes(1);
    expect(cursor.unregisterServer).toHaveBeenCalledWith('eligian');
    const unregistered = cursor.unregisterServer.mock.invocationCallOrder[0];
    expect(unregistered).toBeGreaterThan(registered);
    expect(unregistered).toBeLessThan(cursor.registerServer.mock.invocationCallOrder[1]);
    expect(cursor.registerServer.mock.calls[1][0]).toEqual(spec(folder, 'eligian'));
  });

  it('(3) disposing unregisters every registered name once', async () => {
    const cursor = installCursor();
    const talk = makeFolder({}, 'talk');
    const deck = makeFolder({}, 'deck');
    openFolders(talk, deck);
    const disposable = activate();
    await vi.waitFor(() => expect(cursor.registerServer).toHaveBeenCalledTimes(2));

    disposable.dispose();

    expect(cursor.unregisterServer.mock.calls.map(call => call[0]).sort()).toEqual([
      'eligian-deck',
      'eligian-talk',
    ]);
    disposable.dispose();
    expect(cursor.unregisterServer).toHaveBeenCalledTimes(2);
  });

  it('(4) without vscode.cursor.mcp the lm provider is registered', async () => {
    openFolders(makeFolder());

    activate();
    await installPromptSettled();

    expect(h.cursor.mcp).toBeUndefined();
    expect(h.registrations).toHaveLength(1);
    expect(h.registrations[0].id).toBe(PROVIDER_ID);
  });

  it('a partial Cursor API is ignored', async () => {
    const registerServer = vi.fn();
    h.cursor.mcp = { registerServer };
    openFolders(makeFolder());

    activate();
    await installPromptSettled();
    await computeServerSpecs();

    expect(registerServer).not.toHaveBeenCalled();
    expect(h.registrations).toHaveLength(1);
    expect(h.registrations[0].id).toBe(PROVIDER_ID);
  });

  it('the install prompt runs unchanged on the Cursor branch', async () => {
    const cursor = installCursor();
    const folder = makeFolder({ version: '1.0.3' });
    openFolders(folder);
    h.findFiles = [fileUri(path.join(folder, 'talk.eligian'))];

    activate();
    await installPromptSettled();

    expect(h.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(h.showInformationMessage.mock.calls[0][0]).toContain('1.0.3');
    expect(cursor.registerServer).not.toHaveBeenCalled();
    expect(h.registrations).toHaveLength(0);
  });
});

it('never falls back to npx or a bundled CLI', () => {
  expect(h.definitions.length).toBeGreaterThan(0);
  for (const { definition, expectedCommand } of h.definitions) {
    expect(definition.args[0]).toMatch(/node_modules[\\/]eligian[\\/]bin[\\/]cli\.js$/);
    expect(definition.args[1]).toBe('mcp');
    expect(definition.command).toBe(expectedCommand);
  }
});
