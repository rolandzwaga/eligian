/**
 * FileWatcher.ts - Debounced file change watching
 *
 * Purpose: Watches .eligian files for changes and triggers callbacks after a debounce delay.
 * Prevents rapid successive compilations when the user makes multiple quick edits.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (external immutability)
 */

import * as vscode from 'vscode';

/**
 * Watches files for changes with debouncing.
 *
 * Responsibilities:
 * - Subscribe to file save events
 * - Debounce rapid successive saves (300ms delay)
 * - Trigger callbacks only after debounce period
 * - Clean up timers on disposal
 *
 * @example
 * const watcher = new FileWatcher();
 * watcher.watch(documentUri, () => {
 *   console.log('File changed after debounce!');
 * });
 * // Later...
 * watcher.dispose();
 */
export class FileWatcher {
  private static readonly DEBOUNCE_DELAY = 300; // milliseconds
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, () => void> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Listen to document save events
    const saveListener = vscode.workspace.onDidSaveTextDocument(document => {
      this.handleDocumentSaved(document);
    });
    this.disposables.push(saveListener);
  }

  /**
   * Watch a document for changes.
   *
   * @param documentUri - URI of the document to watch
   * @param callback - Function to call after debounce delay when document is saved
   */
  public watch(documentUri: vscode.Uri, callback: () => void): void {
    const key = documentUri.toString();
    this.callbacks.set(key, callback);
    console.log('[FileWatcher] Now watching:', documentUri.fsPath);
  }

  /**
   * Stop watching a document.
   *
   * @param documentUri - URI of the document to stop watching
   */
  public unwatch(documentUri: vscode.Uri): void {
    const key = documentUri.toString();

    // Clear any pending timer
    const timer = this.debounceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(key);
    }

    // Remove callback
    this.callbacks.delete(key);
    console.log('[FileWatcher] Stopped watching:', documentUri.fsPath);
  }

  /**
   * Handle document saved event.
   */
  private handleDocumentSaved(document: vscode.TextDocument): void {
    const key = document.uri.toString();

    // Check if we're watching this document
    const callback = this.callbacks.get(key);
    if (!callback) {
      return; // Not watching this document
    }

    console.log('[FileWatcher] Document saved, starting debounce:', document.uri.fsPath);

    // Clear existing timer for this document
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      console.log('[FileWatcher] Cleared previous debounce timer');
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      console.log('[FileWatcher] Debounce complete, triggering callback');
      this.debounceTimers.delete(key);
      callback();
    }, FileWatcher.DEBOUNCE_DELAY);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Dispose all watchers and timers.
   */
  public dispose(): void {
    console.log('[FileWatcher] Disposing all watchers');

    // Clear all timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Clear all callbacks
    this.callbacks.clear();

    // Dispose event listeners
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
