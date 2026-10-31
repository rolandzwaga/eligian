/**
 * Multi-root watcher coverage (audit medium #41)
 *
 * The base watcher used to create ONE FileSystemWatcher rooted at the first
 * registering document's workspace folder, so imports in other roots (or outside
 * every root) were never watched.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { CSSWatcherManager } from '../css-watcher.js';
import { LabelsWatcherManager } from '../labels-watcher.js';

interface FakeWatcher {
  pattern: any;
  fire: { change: (uri: any) => void };
  dispose: ReturnType<typeof vi.fn>;
}

const norm = (p: string): string => p.split(String.fromCharCode(92)).join('/').replace(/^[/]+/, '');

const folderA = { uri: URI.file('F:/ws/a'), name: 'a', index: 0 };
const folderB = { uri: URI.file('F:/ws/b'), name: 'b', index: 1 };

function folderFor(uri: { fsPath: string }) {
  const p = norm(uri.fsPath).toLowerCase();
  if (p.startsWith('f:/ws/a/')) return folderA;
  if (p.startsWith('f:/ws/b/')) return folderB;
  return undefined;
}

describe('FileImportWatcherManager watcher roots', () => {
  let watchers: FakeWatcher[];
  let client: { sendNotification: ReturnType<typeof vi.fn> };
  let manager: CSSWatcherManager;

  beforeEach(() => {
    watchers = [];
    // The shared vscode mock's Uri is simplistic; use the real URI implementation.
    vi.spyOn(vscode.Uri as any, 'parse').mockImplementation(((value: string) =>
      URI.parse(value)) as any);
    vi.spyOn(vscode.Uri as any, 'file').mockImplementation(((value: string) =>
      URI.file(value)) as any);
    client = { sendNotification: vi.fn() };
    vi.spyOn(vscode.workspace as any, 'getWorkspaceFolder').mockImplementation(folderFor as any);
    vi.spyOn(vscode.workspace as any, 'createFileSystemWatcher').mockImplementation(((
      pattern: any
    ) => {
      const handlers: { change?: (uri: any) => void } = {};
      const w: FakeWatcher = {
        pattern,
        fire: { change: uri => handlers.change?.(uri) },
        dispose: vi.fn(),
      };
      watchers.push(w);
      return {
        onDidCreate: () => ({ dispose() {} }),
        onDidChange: (cb: (uri: any) => void) => {
          handlers.change = cb;
          return { dispose() {} };
        },
        onDidDelete: () => ({ dispose() {} }),
        dispose: w.dispose,
      };
    }) as any);
    manager = new CSSWatcherManager(() => {}, client as any);
  });

  afterEach(() => {
    manager.dispose();
    vi.restoreAllMocks();
  });

  test('creates one watcher per workspace folder, not just the first', () => {
    manager.registerImports('file:///F:/ws/a/doc.eligian', ['./x.css']);
    manager.registerImports('file:///F:/ws/b/doc.eligian', ['./y.css']);

    expect(watchers).toHaveLength(2);
    const bases = watchers.map(w => w.pattern.base);
    expect(bases).toContain(folderA);
    expect(bases).toContain(folderB);
  });

  test('does not create a duplicate watcher for a second file in the same folder', () => {
    manager.registerImports('file:///F:/ws/a/one.eligian', ['./x.css']);
    manager.registerImports('file:///F:/ws/a/two.eligian', ['./z.css']);

    expect(watchers).toHaveLength(1);
  });

  test('imports escaping every workspace folder get a narrow per-file watcher', () => {
    manager.registerImports('file:///F:/ws/a/doc.eligian', ['../../shared/theme.css']);

    const narrow = watchers.filter(w => w.pattern.pattern === 'theme.css');
    expect(narrow).toHaveLength(1);
    expect(norm(narrow[0].pattern.base.fsPath)).toMatch(/shared$/);
  });

  test('a document outside every folder still watches files inside a workspace folder', () => {
    manager.registerImports('file:///F:/other/doc.eligian', ['../ws/b/styles.css']);

    expect(watchers).toHaveLength(1);
    expect(watchers[0].pattern.base).toBe(folderB);
  });

  test('a change in the second root reaches the LSP notification path', () => {
    vi.useFakeTimers();
    try {
      manager.registerImports('file:///F:/ws/a/doc.eligian', ['./x.css']);
      manager.registerImports('file:///F:/ws/b/doc.eligian', ['./y.css']);

      const watcherB = watchers.find(w => w.pattern.base === folderB)!;
      const changed = URI.file('F:/ws/b/y.css');
      watcherB.fire.change(changed);
      vi.advanceTimersByTime(400);

      expect(client.sendNotification).toHaveBeenCalledTimes(1);
      expect(client.sendNotification.mock.calls[0][1].documentUris).toEqual([
        'file:///F:/ws/b/doc.eligian',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('an empty import URI (import removed) clears the document mapping', () => {
    vi.useFakeTimers();
    try {
      const labels = new LabelsWatcherManager(() => {}, client as any);
      labels.registerImport('file:///F:/ws/a/doc.eligian', './a.json');
      labels.registerImport('file:///F:/ws/a/doc.eligian', '');

      watchers[watchers.length - 1].fire.change(URI.file('F:/ws/a/a.json'));
      vi.advanceTimersByTime(400);

      expect(client.sendNotification).not.toHaveBeenCalled();
      labels.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  test('dispose disposes every watcher', () => {
    manager.registerImports('file:///F:/ws/a/doc.eligian', ['./x.css']);
    manager.registerImports('file:///F:/ws/b/doc.eligian', ['./y.css']);
    manager.dispose();
    for (const w of watchers) {
      expect(w.dispose).toHaveBeenCalled();
    }
  });
});
