/**
 * CSS Watcher Manager
 *
 * Watches CSS files for changes and triggers hot-reload without restarting
 * the Eligius engine. Uses a single FileSystemWatcher with per-file debouncing
 * to handle rapid file changes (e.g., auto-save).
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import * as vscode from 'vscode';

/**
 * Callback invoked when a CSS file changes after debouncing
 */
export type CSSChangeCallback = (filePath: string) => void | Promise<void>;

/**
 * T015-T019: Manages file watching for CSS hot-reload
 *
 * Design:
 * - Single FileSystemWatcher for all CSS files (efficient)
 * - Per-file debouncing (300ms) to handle auto-save
 * - Independent timers for each file (parallel editing support)
 * - Graceful cleanup on disposal
 */
export class CSSWatcherManager {
  private watcher: vscode.FileSystemWatcher | null = null;
  private trackedFiles = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceDelay = 300; // milliseconds
  private readonly onChange: CSSChangeCallback;
  private disposables: vscode.Disposable[] = [];

  /**
   * Create a new CSS watcher manager
   *
   * @param onChange - Callback invoked when CSS file changes (after debouncing)
   */
  constructor(onChange: CSSChangeCallback) {
    this.onChange = onChange;
  }

  /**
   * T016: Start watching CSS files for changes
   *
   * Creates a FileSystemWatcher for the workspace and tracks specified CSS files.
   * File changes are debounced per-file to handle rapid saves.
   *
   * @param cssFiles - Array of CSS file paths to watch (relative to workspace)
   * @param workspaceRoot - Workspace root directory
   */
  startWatching(cssFiles: string[], workspaceRoot: string): void {
    if (cssFiles.length === 0) {
      return;
    }

    // Update tracked files
    this.updateTrackedFiles(cssFiles);

    // Create watcher if it doesn't exist
    if (!this.watcher) {
      // Watch all CSS files in workspace (efficient single watcher)
      const pattern = new vscode.RelativePattern(workspaceRoot, '**/*.css');
      this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

      // Handle file changes
      this.watcher.onDidChange(uri => {
        this.handleFileChange(uri);
      });

      // Handle file deletions (stop watching)
      this.watcher.onDidDelete(uri => {
        this.handleFileDelete(uri);
      });

      this.disposables.push(this.watcher);
      console.log('[CSSWatcher] Started watching CSS files:', cssFiles);
    }
  }

  /**
   * T018: Update the set of tracked files without recreating the watcher
   *
   * @param cssFiles - New array of CSS file paths to track
   */
  updateTrackedFiles(cssFiles: string[]): void {
    this.trackedFiles.clear();
    for (const file of cssFiles) {
      this.trackedFiles.add(file);
    }
  }

  /**
   * Handle file change event (private helper)
   */
  private handleFileChange(uri: vscode.Uri): void {
    const filePath = uri.fsPath;

    // Only process tracked files
    if (!this.trackedFiles.has(filePath)) {
      return;
    }

    console.log('[CSSWatcher] File changed:', filePath);
    this.debounceChange(filePath);
  }

  /**
   * Handle file deletion event (private helper)
   */
  private handleFileDelete(uri: vscode.Uri): void {
    const filePath = uri.fsPath;

    if (this.trackedFiles.has(filePath)) {
      console.log('[CSSWatcher] File deleted:', filePath);
      this.trackedFiles.delete(filePath);

      // Clear any pending debounce timer
      const timer = this.debounceTimers.get(filePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(filePath);
      }
    }
  }

  /**
   * T017: Debounce file change events per-file with 300ms delay
   *
   * Uses independent timers for each file to support parallel editing.
   * This handles auto-save scenarios where files are saved multiple times
   * in quick succession.
   *
   * @param filePath - Absolute path to CSS file that changed
   */
  private debounceChange(filePath: string): void {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Create new timer
    const timer = setTimeout(() => {
      console.log('[CSSWatcher] Debounce complete, triggering reload:', filePath);
      this.debounceTimers.delete(filePath);

      // Invoke callback (async-safe)
      Promise.resolve(this.onChange(filePath)).catch(error => {
        console.error('[CSSWatcher] Error in onChange callback:', error);
      });
    }, this.debounceDelay);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * T019: Dispose the watcher and clean up resources
   *
   * Clears all debounce timers, disposes FileSystemWatcher,
   * and prevents memory leaks.
   */
  dispose(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Dispose watcher
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.watcher = null;

    // Clear tracked files
    this.trackedFiles.clear();

    console.log('[CSSWatcher] Disposed');
  }
}
