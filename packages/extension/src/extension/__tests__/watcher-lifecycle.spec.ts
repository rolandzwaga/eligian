/**
 * Watcher lifecycle coverage (audit low #49, #56, #58)
 *
 * Drives the CSS / HTML / labels watcher managers through fireable fake file-system watchers:
 * debounce coalescing, delete-then-create re-tracking (all three watchers), CSS notifying on
 * untracked deletes, dispose clearing timers, and LSP notification failures staying contained.
 */
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from 'vitest';
import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { CSSWatcherManager } from '../css-watcher.js';
import { HTMLWatcherManager } from '../html-watcher.js';
import { LabelsWatcherManager } from '../labels-watcher.js';

type UriHandler = (uri: URI) => void;

interface FakeWatcher {
  pattern: any;
  fire: { create: UriHandler; change: UriHandler; delete: UriHandler };
  dispose: ReturnType<typeof vi.fn>;
}

const folder = { uri: URI.file('F:/ws'), name: 'ws', index: 0 };
const DOC = 'file:///F:/ws/doc.eligian';

describe('file import watcher lifecycle', () => {
  let watchers: FakeWatcher[];
  let client: { sendNotification: ReturnType<typeof vi.fn> };
  const managers: Array<{ dispose(): void }> = [];

  const track = <T extends { dispose(): void }>(manager: T): T => {
    managers.push(manager);
    return manager;
  };
  const fireAll = (event: keyof FakeWatcher['fire'], uri: URI) => {
    for (const w of watchers) {
      w.fire[event](uri);
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    watchers = [];
    vi.spyOn(vscode.Uri as any, 'parse').mockImplementation(((value: string) =>
      URI.parse(value)) as any);
    vi.spyOn(vscode.Uri as any, 'file').mockImplementation(((value: string) =>
      URI.file(value)) as any);
    vi.spyOn(vscode.workspace as any, 'getWorkspaceFolder').mockImplementation(
      (() => folder) as any
    );
    vi.spyOn(vscode.workspace as any, 'createFileSystemWatcher').mockImplementation(((
      pattern: any
    ) => {
      const handlers: Partial<Record<'create' | 'change' | 'delete', UriHandler>> = {};
      const w: FakeWatcher = {
        pattern,
        fire: {
          create: uri => handlers.create?.(uri),
          change: uri => handlers.change?.(uri),
          delete: uri => handlers.delete?.(uri),
        },
        dispose: vi.fn(),
      };
      watchers.push(w);
      return {
        onDidCreate: (cb: UriHandler) => {
          handlers.create = cb;
          return { dispose() {} };
        },
        onDidChange: (cb: UriHandler) => {
          handlers.change = cb;
          return { dispose() {} };
        },
        onDidDelete: (cb: UriHandler) => {
          handlers.delete = cb;
          return { dispose() {} };
        },
        dispose: w.dispose,
      };
    }) as any);
    client = { sendNotification: vi.fn() };
  });

  afterEach(() => {
    for (const m of managers.splice(0)) {
      m.dispose();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('debounce', () => {
    test('several changes within 300ms produce one notification and one onChange', () => {
      const onChange = vi.fn();
      const manager = track(new HTMLWatcherManager(onChange, client as any));
      manager.registerImport(DOC, './layout.html');
      const file = URI.file('F:/ws/layout.html');

      fireAll('change', file);
      vi.advanceTimersByTime(100);
      fireAll('change', file);
      vi.advanceTimersByTime(100);
      fireAll('change', file);
      expect(client.sendNotification).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(client.sendNotification).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(file.fsPath);
    });

    test('changes to different files debounce independently', () => {
      const manager = track(new CSSWatcherManager(() => {}, client as any));
      manager.registerImports(DOC, ['./a.css', './b.css']);

      fireAll('change', URI.file('F:/ws/a.css'));
      fireAll('change', URI.file('F:/ws/b.css'));
      vi.advanceTimersByTime(300);

      expect(client.sendNotification).toHaveBeenCalledTimes(2);
    });

    test('a change to a file nobody imports is ignored', () => {
      const manager = track(new LabelsWatcherManager(() => {}, client as any));
      manager.registerImport(DOC, './en-US.json');

      fireAll('change', URI.file('F:/ws/package.json'));
      vi.advanceTimersByTime(400);

      expect(client.sendNotification).not.toHaveBeenCalled();
    });

    test('a rejecting onChange callback is swallowed', async () => {
      const manager = track(
        new HTMLWatcherManager(() => Promise.reject(new Error('boom')), client as any)
      );
      manager.registerImport(DOC, './layout.html');

      fireAll('change', URI.file('F:/ws/layout.html'));
      await vi.advanceTimersByTimeAsync(400);

      expect(client.sendNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    ['HTML', () => new HTMLWatcherManager(() => {}, client as any), 'layout.html'],
    ['labels', () => new LabelsWatcherManager(() => {}, client as any), 'en-US.json'],
  ] as const)('%s watcher: delete then create', (_name, makeManager, fileName) => {
    const registerFor = (manager: any) => manager.registerImport(DOC, `./${fileName}`);

    test('hot reload survives a delete followed by a create', () => {
      const manager = track(makeManager());
      registerFor(manager);
      const file = URI.file(`F:/ws/${fileName}`);

      fireAll('delete', file);
      expect(client.sendNotification).toHaveBeenCalledTimes(1); // importing doc revalidates

      fireAll('create', file);
      vi.advanceTimersByTime(400);
      expect(client.sendNotification).toHaveBeenCalledTimes(2); // file is back

      fireAll('change', file);
      vi.advanceTimersByTime(400);
      expect(client.sendNotification).toHaveBeenCalledTimes(3); // and tracked again
      expect(client.sendNotification.mock.calls[2][1].documentUris).toEqual([DOC]);
    });

    test('creating a file that a document already imports revalidates it', () => {
      const manager = track(makeManager());
      registerFor(manager);

      fireAll('create', URI.file(`F:/ws/${fileName}`));
      vi.advanceTimersByTime(400);

      expect(client.sendNotification).toHaveBeenCalledTimes(1);
    });

    test('creating an unrelated file sends nothing', () => {
      const manager = track(makeManager());
      registerFor(manager);

      fireAll('create', URI.file('F:/ws/unrelated.json'));
      fireAll('create', URI.file('F:/ws/unrelated.html'));
      vi.advanceTimersByTime(400);

      expect(client.sendNotification).not.toHaveBeenCalled();
    });

    test('a change after a delete without a create event still re-tracks the import', () => {
      const manager = track(makeManager());
      registerFor(manager);
      const file = URI.file(`F:/ws/${fileName}`);

      fireAll('delete', file);
      client.sendNotification.mockClear();
      fireAll('change', file);
      vi.advanceTimersByTime(400);

      expect(client.sendNotification).toHaveBeenCalledTimes(1);
    });

    test('a delete clears the pending debounce timer', () => {
      const onChange = vi.fn();
      const manager = track(
        fileName.endsWith('.html')
          ? new HTMLWatcherManager(onChange, client as any)
          : new LabelsWatcherManager(onChange, client as any)
      );
      registerFor(manager);
      const file = URI.file(`F:/ws/${fileName}`);

      fireAll('change', file);
      fireAll('delete', file);
      client.sendNotification.mockClear();
      vi.advanceTimersByTime(400);

      expect(onChange).not.toHaveBeenCalled();
      expect(client.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('CSS watcher', () => {
    test('notifies on deleting an untracked file that a document still imports', () => {
      const manager = track(new CSSWatcherManager(() => {}, client as any));
      manager.registerImports(DOC, ['./theme.css']);
      const file = URI.file('F:/ws/theme.css');

      fireAll('delete', file); // untracks
      client.sendNotification.mockClear();
      fireAll('delete', file); // now untracked, but still imported (rename case)

      expect(client.sendNotification).toHaveBeenCalledTimes(1);
    });

    test('create after delete restores hot reload', () => {
      const manager = track(new CSSWatcherManager(() => {}, client as any));
      manager.registerImports(DOC, ['./theme.css']);
      const file = URI.file('F:/ws/theme.css');

      fireAll('delete', file);
      fireAll('create', file);
      client.sendNotification.mockClear();
      fireAll('change', file);
      vi.advanceTimersByTime(400);

      expect(client.sendNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    test('clears pending timers and disposes every watcher', () => {
      const onChange = vi.fn();
      const manager = new HTMLWatcherManager(onChange, client as any);
      manager.registerImport(DOC, './layout.html');

      fireAll('change', URI.file('F:/ws/layout.html'));
      manager.dispose();
      vi.advanceTimersByTime(400);

      expect(onChange).not.toHaveBeenCalled();
      expect(client.sendNotification).not.toHaveBeenCalled();
      for (const w of watchers) {
        expect(w.dispose).toHaveBeenCalled();
      }
    });

    test('events after dispose are ignored', () => {
      const manager = new HTMLWatcherManager(() => {}, client as any);
      manager.registerImport(DOC, './layout.html');
      manager.dispose();

      fireAll('change', URI.file('F:/ws/layout.html'));
      vi.advanceTimersByTime(400);

      expect(client.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('notification failures (client not running)', () => {
    let unhandled: Mock<(...args: unknown[]) => void>;

    beforeEach(() => {
      unhandled = vi.fn<(...args: unknown[]) => void>();
      process.on('unhandledRejection', unhandled);
    });

    afterEach(() => {
      process.off('unhandledRejection', unhandled);
    });

    test.each([
      ['CSS', () => new CSSWatcherManager(() => {}, client as any), 'theme.css'],
      ['HTML', () => new HTMLWatcherManager(() => {}, client as any), 'layout.html'],
      ['labels', () => new LabelsWatcherManager(() => {}, client as any), 'en-US.json'],
    ] as const)(
      '%s: a rejected sendNotification is not an unhandled rejection',
      async (_n, make, fileName) => {
        client.sendNotification.mockRejectedValue(new Error('Client is not running'));
        const manager = track(make()) as any;
        (manager.registerImports ?? manager.registerImport).call(
          manager,
          DOC,
          manager.registerImports ? [`./${fileName}`] : `./${fileName}`
        );

        fireAll('change', URI.file(`F:/ws/${fileName}`));
        await vi.advanceTimersByTimeAsync(400);
        vi.useRealTimers();
        await new Promise<void>(resolve => setTimeout(resolve, 20));

        expect(client.sendNotification).toHaveBeenCalledTimes(1);
        expect(unhandled).not.toHaveBeenCalled();
      }
    );

    test('a synchronously throwing sendNotification does not break the watcher', () => {
      client.sendNotification.mockImplementation(() => {
        throw new Error('sync failure');
      });
      const manager = track(new HTMLWatcherManager(() => {}, client as any));
      manager.registerImport(DOC, './layout.html');

      fireAll('change', URI.file('F:/ws/layout.html'));
      expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    });
  });
});
