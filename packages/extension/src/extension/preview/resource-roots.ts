/**
 * resource-roots.ts - Helpers for the preview webview's `localResourceRoots`
 *
 * The preview webview may only load local files (media, CSS `url()` assets)
 * that live under one of its `localResourceRoots`. A loose `.eligian` file
 * (no workspace folder open) or one that references assets outside the opened
 * folders (e.g. `../shared/bg.png`) would otherwise have every request refused
 * silently. These helpers compute the initial roots and the extra directories
 * a compiled config needs.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (pure helpers)
 */

import * as path from 'node:path';
import type * as vscode from 'vscode';

/**
 * Whether `child` is `parent` itself or lies somewhere below it.
 *
 * Uses `path.relative`, which is case-insensitive on Windows.
 */
export function isPathWithin(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  if (relative === '') {
    return true;
  }
  if (path.isAbsolute(relative)) {
    // Different drive / root on Windows
    return false;
  }
  return relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

/**
 * Directories that must be added to `rootDirs` so that every file in
 * `filePaths` is covered by a root.
 *
 * Returns the minimal set of the files' own directories (a directory already
 * covered by a returned parent is not repeated). Order is shortest path first.
 *
 * @param rootDirs - Absolute directories already allowed
 * @param filePaths - Absolute paths of local files the webview will load
 */
export function findUncoveredDirectories(
  rootDirs: readonly string[],
  filePaths: Iterable<string>
): string[] {
  const candidates = new Set<string>();
  for (const filePath of filePaths) {
    candidates.add(path.dirname(path.resolve(filePath)));
  }

  const added: string[] = [];
  const sorted = [...candidates].sort((a, b) => a.length - b.length);
  for (const dir of sorted) {
    const covered =
      rootDirs.some(root => isPathWithin(dir, root)) || added.some(root => isPathWithin(dir, root));
    if (!covered) {
      added.push(dir);
    }
  }
  return added;
}

/**
 * Initial local resource root directories for a preview of `documentPath`:
 * every workspace folder plus the document's own directory when no workspace
 * folder already contains it.
 *
 * @param workspaceFolderPaths - fsPaths of the open workspace folders
 * @param documentPath - fsPath of the `.eligian` document being previewed
 */
export function computeInitialRootDirectories(
  workspaceFolderPaths: readonly string[],
  documentPath: string
): string[] {
  return [
    ...workspaceFolderPaths,
    ...findUncoveredDirectories(workspaceFolderPaths, [documentPath]),
  ];
}

/**
 * Wrap a webview so every `asWebviewUri` call for a `file:` URI reports the
 * local path it exposes. All other members are forwarded unchanged.
 *
 * Used to learn which local files a resolved config / rewritten CSS refers to,
 * so the panel can extend `localResourceRoots` before posting them.
 *
 * @param webview - The real webview
 * @param record - Called with the fsPath of each local file converted
 */
export function createRecordingWebview(
  webview: vscode.Webview,
  record: (fsPath: string) => void
): vscode.Webview {
  return new Proxy(webview, {
    get(target, prop) {
      if (prop === 'asWebviewUri') {
        return (uri: vscode.Uri) => {
          if (uri.scheme === 'file') {
            record(uri.fsPath);
          }
          return target.asWebviewUri(uri);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
