/**
 * Base File-Import Watcher Manager
 *
 * Shared implementation for the CSS / HTML / Labels watcher managers
 * (consolidation D1). Each concrete watcher differs only in its glob pattern,
 * the LSP notification it sends, and its delete-notification semantics — all supplied via {@link FileWatcherConfig}.
 *
 * Design:
 * - One FileSystemWatcher per workspace folder (multi-root aware), plus a narrow
 *   per-file watcher for imports that live outside every workspace folder
 * - Per-file debouncing (300ms) to handle auto-save
 * - Independent timers for each file (parallel editing support)
 * - Reverse mapping: imported file URI → documents that import it (for LSP notifications)
 * - Graceful cleanup on disposal
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import * as path from 'node:path';
import { resolveImportPathToUri } from '@eligian/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { debounce } from './debounce-util.js';

/**
 * Callback invoked when a watched file changes after debouncing.
 */
export type FileChangeCallback = (filePath: string) => void | Promise<void>;

/**
 * Per-watcher configuration that captures the only differences between the
 * concrete CSS / HTML / Labels watchers.
 */
export interface FileWatcherConfig {
  /** Workspace-relative glob pattern, e.g. `'**\/*.css'`. */
  readonly globPattern: string;

  /**
   * Send the update notification on delete even when the deleted file is not
   * currently tracked. Used by the CSS watcher to handle the rename case where
   * the old path is no longer tracked but documents still reference it.
   * Default: `false` (notify only when the deleted file was tracked).
   */
  readonly notifyOnDeleteWhenUntracked?: boolean;

  /**
   * Send the asset's "updated" LSP notification. Invoked by the base only when
   * a client is present and at least one document imports the file.
   *
   * @param client - The active language client (guaranteed non-null here)
   * @param fileUri - URI of the changed/created/deleted file (file:///...)
   * @param documentUris - Eligian documents that import the file
   * @returns The client's send promise (if any); the base catches its rejection, which
   *   occurs when the client is not running (stopped, restarting, deactivating)
   */
  readonly sendUpdateNotification: (
    client: LanguageClient,
    fileUri: string,
    documentUris: string[]
  ) => Promise<void> | void;
}

/**
 * Manages file watching for asset hot-reload validation.
 *
 * Concrete subclasses supply a {@link FileWatcherConfig} and expose an
 * asset-specific public registration method that delegates to
 * {@link FileImportWatcherManager.registerImportsInternal}.
 */
export abstract class FileImportWatcherManager {
  /** Active watchers keyed by workspace-folder URI or outside-file path. */
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly trackedFiles = new Set<string>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceDelay = 300; // milliseconds
  private readonly onChange: FileChangeCallback;
  private disposables: vscode.Disposable[] = [];

  /** LSP notification support for validation hot-reload. */
  protected readonly client: LanguageClient | null;

  /** Reverse mapping: imported file URI → Set of document URIs that import it. */
  private readonly importsByFile = new Map<string, Set<string>>();

  private readonly config: FileWatcherConfig;

  /**
   * @param config - Per-watcher configuration (glob, notification, semantics)
   * @param onChange - Callback invoked when a file changes (after debouncing)
   * @param client - Optional LanguageClient for sending LSP notifications
   */
  constructor(config: FileWatcherConfig, onChange: FileChangeCallback, client?: LanguageClient) {
    this.config = config;
    this.onChange = onChange;
    this.client = client || null;
  }

  /**
   * Register which files an Eligian document imports.
   *
   * Builds the reverse mapping (file URI → documents) and starts watching the
   * files. Clears any previous imports for this document first, so stale
   * mappings (e.g. from renamed files) are removed.
   *
   * @param documentUri - Absolute Eligian document URI (file:///...)
   * @param fileUris - Imported file URIs (may be relative like `"./styles.css"`)
   */
  protected registerImportsInternal(documentUri: string, fileUris: string[]): void {
    // CRITICAL: Clear old mappings for this document first.
    // This prevents stale entries when paths are corrected after being invalid.
    this.clearDocumentMappings(documentUri);

    const validUris = fileUris.filter(Boolean);
    if (validUris.length === 0) {
      return;
    }

    // Collect absolute file paths for watching.
    const filePaths: string[] = [];

    for (const fileUri of validUris) {
      // Convert relative paths to absolute URIs to match file change events.
      const absoluteUri = resolveImportPathToUri(documentUri, fileUri);

      let documents = this.importsByFile.get(absoluteUri);
      if (!documents) {
        documents = new Set();
        this.importsByFile.set(absoluteUri, documents);
      }
      documents.add(documentUri);

      filePaths.push(vscode.Uri.parse(absoluteUri).fsPath);
    }

    // Start watching (idempotent - watchers are created once per root).
    this.startWatching(filePaths);
  }

  /**
   * Clear all import mappings for a specific document.
   *
   * Removes the document from every file → document mapping. Used when document
   * imports change or the document is closed.
   *
   * @param documentUri - Absolute Eligian document URI
   */
  private clearDocumentMappings(documentUri: string): void {
    for (const [fileUri, documents] of this.importsByFile.entries()) {
      documents.delete(documentUri);
      // Clean up empty sets to prevent memory leaks.
      if (documents.size === 0) {
        this.importsByFile.delete(fileUri);
      }
    }
  }

  /**
   * Start watching files for changes.
   *
   * Tracks the specified files and makes sure a FileSystemWatcher covers each of
   * them. Each file is covered by the watcher of the workspace folder that
   * contains it (one watcher per folder, so multi-root workspaces work). Files
   * outside every workspace folder (e.g. `../shared/theme.css` escaping the
   * root) get a narrow watcher on their own directory. File changes are
   * debounced per-file.
   *
   * @param files - Absolute file paths to track
   * @param _workspaceRoot - Deprecated and ignored: the root is derived per file
   */
  startWatching(files: string[], _workspaceRoot?: string): void {
    if (files.length === 0) {
      return;
    }

    this.updateTrackedFiles(files);

    for (const file of files) {
      this.ensureWatcherFor(file);
    }
  }

  /**
   * Create (once) the watcher that covers `file`.
   */
  private ensureWatcherFor(file: string): void {
    const fileUri = vscode.Uri.file(file);
    const folder = vscode.workspace.getWorkspaceFolder(fileUri);

    let key: string;
    let pattern: vscode.RelativePattern;
    if (folder) {
      key = `folder:${folder.uri.toString()}`;
      if (this.watchers.has(key)) {
        return;
      }
      pattern = new vscode.RelativePattern(folder, this.config.globPattern);
    } else {
      // Outside every workspace folder: watch just this one file (narrow pattern).
      key = `file:${file}`;
      if (this.watchers.has(key)) {
        return;
      }
      pattern = new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(file)),
        path.basename(file)
      );
    }

    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watchers.set(key, watcher);

    // File creation (restored after a delete, renamed back to an imported name, or created
    // after the import was written) re-tracks the file and revalidates, for every watcher.
    watcher.onDidCreate(uri => {
      this.handleFileCreate(uri);
    });

    watcher.onDidChange(uri => {
      this.handleFileChange(uri);
    });

    watcher.onDidDelete(uri => {
      this.handleFileDelete(uri);
    });

    this.disposables.push(watcher);
  }

  /**
   * Add files to the tracked set without recreating the watcher.
   *
   * Accumulate-only semantics (no clear) so multiple documents tracking files
   * via the shared watcher do not evict each other's entries; tracked files are
   * cleared only on delete or {@link dispose}.
   */
  private updateTrackedFiles(files: string[]): void {
    for (const file of files) {
      this.trackedFiles.add(file);
    }
  }

  /**
   * Handle a file-create event.
   *
   * When a file that documents import appears (delete followed by create, a rename back
   * to an imported name, or a file created after the import was written), it is tracked
   * again - the preceding delete event untracked it - and revalidation plus the
   * hot-reload callback run through the usual debounce.
   */
  private handleFileCreate(uri: vscode.Uri): void {
    const filePath = uri.fsPath;
    const fileUri = vscode.Uri.file(filePath).toString();

    if (!this.importsByFile.has(fileUri)) {
      return;
    }

    this.trackedFiles.add(filePath);
    this.debounceChange(filePath);
  }

  /**
   * Handle a file-change event (private helper).
   */
  private handleFileChange(uri: vscode.Uri): void {
    const filePath = uri.fsPath;

    // Only process tracked files. A file that documents still import is tracked again here
    // so a missed create event (coalesced delete + add) cannot leave hot-reload dead.
    if (!this.trackedFiles.has(filePath)) {
      if (!this.importsByFile.has(vscode.Uri.file(filePath).toString())) {
        return;
      }
      this.trackedFiles.add(filePath);
    }

    this.debounceChange(filePath);
  }

  /**
   * Handle a file-delete event (private helper).
   */
  private handleFileDelete(uri: vscode.Uri): void {
    const filePath = uri.fsPath;
    const wasTracked = this.trackedFiles.has(filePath);

    // Notify importing documents so they revalidate against the now-missing
    // file. The CSS watcher notifies even for untracked files (rename case).
    if (this.config.notifyOnDeleteWhenUntracked || wasTracked) {
      const fileUri = vscode.Uri.file(filePath).toString();
      this.notifyFileChanged(fileUri);
    }

    // Stop tracking the deleted file and clear any pending debounce timer.
    if (wasTracked) {
      this.trackedFiles.delete(filePath);

      const timer = this.debounceTimers.get(filePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(filePath);
      }
    }
  }

  /**
   * Debounce file-change events per-file with a 300ms delay.
   *
   * Uses independent timers per file to support parallel editing and to absorb
   * auto-save bursts. On fire: sends the LSP notification, then invokes the
   * change callback (async-safe).
   *
   * @param filePath - Absolute path to the file that changed
   */
  private debounceChange(filePath: string): void {
    debounce(this.debounceTimers, filePath, this.debounceDelay, () => {
      const fileUri = vscode.Uri.file(filePath).toString();
      this.notifyFileChanged(fileUri);

      // Invoke callback (async-safe) for hot-reload.
      Promise.resolve(this.onChange(filePath)).catch(_error => {
        // Error in onChange callback - silently ignore.
      });
    });
  }

  /**
   * Send the asset's "updated" LSP notification for a file, but only when a
   * client is present and at least one document imports it.
   */
  private notifyFileChanged(fileUri: string): void {
    if (!this.client) {
      return;
    }
    const documentUris = Array.from(this.importsByFile.get(fileUri) || []);
    if (documentUris.length === 0) {
      return;
    }
    // sendNotification rejects when the client is not running (stopped, restarting after a
    // crash, deactivating); a lost hot-reload notification must not become an unhandled
    // rejection in the extension host.
    try {
      Promise.resolve(this.config.sendUpdateNotification(this.client, fileUri, documentUris)).catch(
        () => {}
      );
    } catch {
      // Synchronous failure: same treatment
    }
  }

  /**
   * Dispose the watcher and clean up resources.
   *
   * Clears all debounce timers, disposes the FileSystemWatcher, and clears the
   * tracked-files set and import mappings to prevent memory leaks.
   */
  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.watchers.clear();

    this.trackedFiles.clear();
    this.importsByFile.clear();
  }
}
