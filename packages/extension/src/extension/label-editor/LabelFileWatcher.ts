/**
 * Label File Watcher
 *
 * Watches label JSON files for external changes and triggers reload
 * in the custom editor webview. Uses debouncing to handle rapid
 * file changes (e.g., auto-save).
 *
 * Feature 036 T058-T059: User Story 6 - File Compatibility
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';

/**
 * Callback invoked when label file changes after debouncing
 */
export type LabelFileChangeCallback = (fileUri: vscode.Uri) => void | Promise<void>;

/**
 * T058: Manages file watching for label JSON files
 *
 * Design:
 * - Single FileSystemWatcher for each label file being edited
 * - Debouncing (300ms) to handle auto-save
 * - Graceful cleanup on disposal
 */
export class LabelFileWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceDelay = 300; // milliseconds
  private readonly onChange: LabelFileChangeCallback;
  private readonly fileUri: vscode.Uri;

  /**
   * Create a new label file watcher
   *
   * @param fileUri - URI of the label file to watch
   * @param onChange - Callback invoked when file changes (after debouncing)
   */
  constructor(fileUri: vscode.Uri, onChange: LabelFileChangeCallback) {
    this.fileUri = fileUri;
    this.onChange = onChange;
    this.startWatching();
  }

  /**
   * Start watching the label file
   */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Called in constructor
  private startWatching(): void {
    // Create watcher for this specific file
    const pattern = new vscode.RelativePattern(
      vscode.Uri.joinPath(this.fileUri, '..'),
      vscode.Uri.parse(this.fileUri.path).fsPath.split('/').pop() || '*.json'
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Handle file changes (debounced)
    this.watcher.onDidChange(uri => {
      if (uri.toString() === this.fileUri.toString()) {
        this.debouncedOnChange();
      }
    });

    // Clean up on file deletion
    this.watcher.onDidDelete(uri => {
      if (uri.toString() === this.fileUri.toString()) {
        // File was deleted - close the editor or show error
        vscode.window.showWarningMessage(`Label file '${uri.fsPath}' was deleted.`);
      }
    });
  }

  /**
   * Debounce file change events (300ms)
   */
  private debouncedOnChange(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.onChange(this.fileUri);
      this.debounceTimer = null;
    }, this.debounceDelay);
  }

  /**
   * Dispose the watcher and cleanup resources
   */
  dispose(): void {
    // Clear pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Dispose file watcher
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = null;
    }
  }
}
