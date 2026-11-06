/**
 * The Eligian MCP server for Copilot agent mode (spec 058 phase 4, plan A3): one stdio server
 * per trusted workspace folder that has `eligian` 1.1 or later installed, started as
 * `<command> <folder>/node_modules/eligian/bin/cli.js mcp` in that folder (FR-002, FR-009).
 * A server the user configured (`.vscode/mcp.json`, the workspace-level `mcp` configuration)
 * wins (FR-004, FR-034).
 */
import * as vscode from 'vscode';
import { debounce } from '../debounce-util.js';
import {
  hasEligianServer,
  installCommand,
  readEligianInstall,
  vscodeMcpJsonState,
} from './install-state.js';

export const PROVIDER_ID = 'eligian.mcp';
export const DISMISSED_KEY = 'eligian.mcp.installPromptDismissed';
export const DEBOUNCE_MS = 500;
export const FOLLOW_UP_MS = 3000;

/** One server the extension would start (both branches build their records from it). */
export interface EligianServerSpec {
  readonly folder: vscode.Uri;
  /** 'Eligian' | `Eligian (${folder name})` */
  readonly label: string;
  /** Cursor: 'eligian' | `eligian-${folder name}` */
  readonly name: string;
  /** eligian.mcp.command, blank → 'node' */
  readonly command: string;
  /** [<folder>/node_modules/eligian/bin/cli.js, 'mcp'] */
  readonly args: readonly string[];
  readonly version: string;
}

let channel: vscode.OutputChannel | undefined;

/** FR-004: the one log line, on a channel created the first time it is needed. */
const log = (line: string): void => {
  channel ??= vscode.window.createOutputChannel('Eligian MCP');
  channel.appendLine(line);
};

const commandSetting = (folder: vscode.Uri): string => {
  const value = vscode.workspace.getConfiguration('eligian.mcp', folder).get<unknown>('command');
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'node';
};

interface Candidate {
  readonly folder: vscode.WorkspaceFolder;
  readonly version: string;
}

const enabledFor = (folder: vscode.WorkspaceFolder): boolean =>
  vscode.workspace.getConfiguration('eligian.mcp', folder.uri).get<boolean>('enabled', true) !==
  false;

const folderLevelServer = (folder: vscode.WorkspaceFolder): boolean =>
  hasEligianServer(
    vscode.workspace.getConfiguration('mcp', folder.uri).inspect<Record<string, unknown>>('servers')
      ?.workspaceFolderValue
  );

/** FR-034: an Eligian server in the workspace-level `mcp` configuration covers every folder. */
const workspaceLevelServer = (): boolean =>
  hasEligianServer(
    vscode.workspace.getConfiguration('mcp').inspect<Record<string, unknown>>('servers')
      ?.workspaceValue
  );

/** The folder qualifies (FR-002 (b)–(e)); `undefined` when it does not. */
const qualify = async (folder: vscode.WorkspaceFolder): Promise<Candidate | undefined> => {
  if (folder.uri.scheme !== 'file') return undefined;
  if (!enabledFor(folder) || folderLevelServer(folder)) return undefined;
  const fileState = await vscodeMcpJsonState(folder.uri.fsPath);
  if (fileState === 'configured') return undefined;
  if (fileState === 'unparsable') {
    log(`${folder.name}: .vscode/mcp.json does not parse; registering the Eligian server anyway.`);
  }
  const install = await readEligianInstall(folder.uri.fsPath);
  return install.ok ? { folder, version: install.version } : undefined;
};

/** FR-002: the specs for the current workspace; never shows UI. */
export async function computeServerSpecs(): Promise<readonly EligianServerSpec[]> {
  if (!vscode.workspace.isTrusted || workspaceLevelServer()) return [];
  const folders = vscode.workspace.workspaceFolders ?? [];
  const candidates: Candidate[] = [];
  for (const folder of folders) {
    const candidate = await qualify(folder);
    if (candidate) candidates.push(candidate);
  }
  const several = candidates.length > 1;
  return candidates.map(({ folder, version }) => ({
    folder: folder.uri,
    label: several ? `Eligian (${folder.name})` : 'Eligian',
    name: several ? `eligian-${folder.name}` : 'eligian',
    command: commandSetting(folder.uri),
    args: [
      vscode.Uri.joinPath(folder.uri, 'node_modules', 'eligian', 'bin', 'cli.js').fsPath,
      'mcp',
    ],
    version,
  }));
}

/** The `lm` record of a spec: a stdio definition started in its folder. */
export function toDefinition(spec: EligianServerSpec): vscode.McpStdioServerDefinition {
  const definition = new vscode.McpStdioServerDefinition(
    spec.label,
    spec.command,
    [...spec.args],
    {},
    spec.version
  );
  definition.cwd = spec.folder;
  return definition;
}

const INSTALL = 'Install';
const DONT_ASK = "Don't Ask Again";

/** Every install-prompt check started so far; `activate` never awaits it. */
let promptChecks: Promise<void> = Promise.resolve();

/** Resolves once every install-prompt check started so far has finished (for tests). */
export function installPromptSettled(): Promise<void> {
  return promptChecks;
}

const hasEligianFile = async (folder: vscode.WorkspaceFolder): Promise<boolean> =>
  (
    await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, '**/*.eligian'),
      '**/node_modules/**',
      1
    )
  ).length > 0;

interface PromptTarget {
  readonly folder: vscode.WorkspaceFolder;
  readonly version?: string;
}

/**
 * FR-008: the first folder, in `workspaceFolders` order, that is enabled, has no configured
 * server and fails the install check, with an existing `node_modules/eligian/package.json` or,
 * when that is missing, an `.eligian` file. An unrelated folder is never asked.
 */
const promptTarget = async (): Promise<PromptTarget | undefined> => {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== 'file' || !enabledFor(folder) || folderLevelServer(folder)) continue;
    if ((await vscodeMcpJsonState(folder.uri.fsPath)) === 'configured') continue;
    const install = await readEligianInstall(folder.uri.fsPath);
    if (install.ok) continue;
    if (install.problem === 'missing' && !(await hasEligianFile(folder))) continue;
    return { folder, version: install.version };
  }
  return undefined;
};

/**
 * FR-003: the five non-recursive watchers of a folder. Simple patterns are not subject to
 * `files.watcherExclude` (which excludes `node_modules/*`), and the ancestor watchers report
 * an install into a folder that had no `node_modules` yet.
 */
const watchFolder = (folder: vscode.Uri, changed: () => void): vscode.Disposable[] => {
  const join = (...segments: string[]) => vscode.Uri.joinPath(folder, ...segments);
  const patterns: [vscode.Uri, string][] = [
    [join('node_modules', 'eligian'), 'package.json'],
    [join('node_modules'), 'eligian'],
    [folder, 'node_modules'],
    [join('.vscode'), 'mcp.json'],
    [folder, '.vscode'],
  ];
  return patterns.flatMap(([base, pattern]) => {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(base, pattern)
    );
    return [
      watcher,
      watcher.onDidCreate(changed),
      watcher.onDidChange(changed),
      watcher.onDidDelete(changed),
    ];
  });
};

/** Cursor's documented API (plan P2, https://cursor.com/docs/context/mcp-extension-api). */
export interface CursorMcpApi {
  registerServer(config: {
    name: string;
    server: { command: string; args: string[]; env: Record<string, string> };
  }): void;
  unregisterServer(serverName: string): void;
}

/** FR-010: Cursor's `vscode.cursor.mcp`, only when both functions exist. */
export function cursorMcpApi(): CursorMcpApi | undefined {
  const mcp = (vscode as unknown as { cursor?: { mcp?: Partial<CursorMcpApi> } }).cursor?.mcp;
  return typeof mcp?.registerServer === 'function' && typeof mcp.unregisterServer === 'function'
    ? (mcp as CursorMcpApi)
    : undefined;
}

/** How the specs reach the editor: the `lm` provider or Cursor's registry. */
interface Branch {
  /** The workspace may have changed: tell the editor. */
  publish(): void;
  dispose(): void;
}

/**
 * FR-011: registers the specs with Cursor at activation and on every change (unregistering
 * every name registered before); disposing unregisters them. Syncs run one at a time.
 */
const cursorBranch = (
  api: CursorMcpApi,
  provided: (specs: readonly EligianServerSpec[]) => void
): Branch => {
  let names: string[] = [];
  let disposed = false;
  let syncing: Promise<void> = Promise.resolve();
  const sync = async (): Promise<void> => {
    const specs = await computeServerSpecs();
    if (disposed) return;
    for (const name of names) api.unregisterServer(name);
    names = [];
    for (const spec of specs) {
      api.registerServer({
        name: spec.name,
        server: { command: spec.command, args: [...spec.args], env: {} },
      });
      names.push(spec.name);
    }
    provided(specs);
  };
  const publish = (): void => {
    syncing = syncing.then(sync).catch(error => {
      log(`Cursor registration failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  };
  publish();
  return {
    publish,
    dispose() {
      disposed = true;
      for (const name of names) api.unregisterServer(name);
      names = [];
    },
  };
};

/** FR-001: the `lm` provider under `PROVIDER_ID`; VS Code asks for the definitions itself. */
const lmBranch = (provided: (specs: readonly EligianServerSpec[]) => void): Branch => {
  const emitter = new vscode.EventEmitter<void>();
  const provider: vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition> = {
    onDidChangeMcpServerDefinitions: emitter.event,
    provideMcpServerDefinitions: async () => {
      const specs = await computeServerSpecs();
      provided(specs);
      return specs.map(toDefinition);
    },
  };
  const registration = vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, provider);
  return {
    publish: () => emitter.fire(),
    dispose() {
      registration.dispose();
      emitter.dispose();
    },
  };
};

/**
 * FR-001 / FR-011: registers through Cursor's API when it exists, else the `lm` provider; a
 * no-op on hosts with neither (P15). Watchers, debounce, follow-up and prompt are shared.
 */
export function registerEligianMcpServer(context: vscode.ExtensionContext): vscode.Disposable {
  const cursor = cursorMcpApi();
  if (!cursor && typeof vscode.lm?.registerMcpServerDefinitionProvider !== 'function') {
    return { dispose() {} };
  }
  const timers = new Map<string, NodeJS.Timeout>();
  const watchers = new Map<string, vscode.Disposable[]>();
  let disposed = false;
  /** JSON of the specs last handed to the editor; `undefined` until then. */
  let lastProvided: string | undefined;
  /** FR-008: at most one notification per activation. */
  let promptShown = false;

  const checkInstallPrompt = async (): Promise<void> => {
    if (promptShown || context.workspaceState.get<boolean>(DISMISSED_KEY) === true) return;
    if (!vscode.workspace.isTrusted || workspaceLevelServer()) return;
    const target = await promptTarget();
    // Set before the UI call, so a check running concurrently cannot show a second one.
    if (target === undefined || promptShown || disposed) return;
    promptShown = true;
    const { folder, version } = target;
    const found = version ? `; found ${version}` : '';
    const choice = await vscode.window.showInformationMessage(
      `Eligian tools for Copilot need \`eligian\` 1.1 or later in this folder (${folder.name}${found}).`,
      INSTALL,
      DONT_ASK
    );
    if (choice === INSTALL) {
      const terminal = vscode.window.createTerminal({ name: 'Eligian: install', cwd: folder.uri });
      terminal.show();
      terminal.sendText(await installCommand(folder.uri.fsPath));
    } else if (choice === DONT_ASK) {
      await context.workspaceState.update(DISMISSED_KEY, true);
    }
  };

  const startPromptCheck = (): void => {
    const check = checkInstallPrompt().catch(error => {
      log(`Install prompt failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    promptChecks = Promise.all([promptChecks, check]).then(() => undefined);
  };

  const fire = (): void => {
    if (disposed) return;
    branch.publish();
    startPromptCheck();
  };

  /** P3: an install can finish after its first watcher event; fire again only on a difference. */
  const followUp = async (): Promise<void> => {
    const specs = JSON.stringify(await computeServerSpecs());
    if (lastProvided !== undefined && specs !== lastProvided) fire();
  };

  const changed = (fromWatcher: boolean): void => {
    if (disposed) return;
    debounce(timers, 'change', DEBOUNCE_MS, fire);
    if (fromWatcher) debounce(timers, 'follow-up', FOLLOW_UP_MS, () => void followUp());
  };
  const watcherChanged = () => changed(true);

  const watch = (folder: vscode.WorkspaceFolder): void => {
    if (folder.uri.scheme !== 'file' || watchers.has(folder.uri.fsPath)) return;
    watchers.set(folder.uri.fsPath, watchFolder(folder.uri, watcherChanged));
  };
  const unwatch = (folder: vscode.WorkspaceFolder): void => {
    for (const disposable of watchers.get(folder.uri.fsPath) ?? []) disposable.dispose();
    watchers.delete(folder.uri.fsPath);
  };
  for (const folder of vscode.workspace.workspaceFolders ?? []) watch(folder);

  const listeners = [
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('eligian.mcp') || event.affectsConfiguration('mcp')) {
        changed(false);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
      for (const folder of event.removed) unwatch(folder);
      for (const folder of event.added) watch(folder);
      changed(false);
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => changed(false)),
  ];

  const provided = (specs: readonly EligianServerSpec[]): void => {
    lastProvided = JSON.stringify(specs);
  };
  const branch = cursor ? cursorBranch(cursor, provided) : lmBranch(provided);
  startPromptCheck();
  return {
    dispose() {
      disposed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const folderWatchers of watchers.values()) {
        for (const disposable of folderWatchers) disposable.dispose();
      }
      watchers.clear();
      for (const listener of listeners) listener.dispose();
      branch.dispose();
    },
  };
}
