/**
 * CSS Watcher Manager
 *
 * Watches CSS files for changes and triggers hot-reload without restarting
 * the Eligius engine. Uses a single FileSystemWatcher with per-file debouncing
 * to handle rapid file changes (e.g., auto-save).
 *
 * Feature 013 T022: Extended to support LSP notifications for validation hot-reload.
 * When a CSS file changes, notifies the language server so validation can be re-triggered.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import { CSS_UPDATED_NOTIFICATION } from '@eligian/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

/**
 * Callback invoked when a CSS file changes after debouncing
 */
export type CSSChangeCallback = (filePath: string) => void | Promise<void>;

/**
 * T015-T019: Manages file watching for CSS hot-reload
 * T022: Extended to support LSP notifications for validation hot-reload
 *
 * Design:
 * - Single FileSystemWatcher for all CSS files (efficient)
 * - Per-file debouncing (300ms) to handle auto-save
 * - Independent timers for each file (parallel editing support)
 * - Reverse mapping: CSS file URI → documents that import it (for LSP notifications)
 * - Graceful cleanup on disposal
 */
export class CSSWatcherManager {
  private watcher: vscode.FileSystemWatcher | null = null;
  private trackedFiles = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceDelay = 300; // milliseconds
  private readonly onChange: CSSChangeCallback;
  private disposables: vscode.Disposable[] = [];

  // T022: LSP notification support for validation hot-reload
  private client: LanguageClient | null = null;
  private importsByCSS = new Map<string, Set<string>>(); // CSS file URI → Set<document URIs>

  /**
   * Create a new CSS watcher manager
   *
   * @param onChange - Callback invoked when CSS file changes (after debouncing)
   * @param client - Optional LanguageClient for sending LSP notifications (Feature 013 T022)
   */
  constructor(onChange: CSSChangeCallback, client?: LanguageClient) {
    this.onChange = onChange;
    this.client = client || null;
  }

  /**
   * T022: Register which CSS files an Eligian document imports
   *
   * Builds reverse mapping: CSS file URI → Set of document URIs that import it.
   * Used to determine which documents need re-validation when a CSS file changes.
   *
   * @param documentUri - Absolute Eligian document URI (file:///...)
   * @param cssFileUris - CSS file URIs imported by the document (may be relative like "./styles.css")
   */
  registerImports(documentUri: string, cssFileUris: string[]): void {
    // For each CSS file, track that this document imports it
    for (const cssFileUri of cssFileUris) {
      // Convert relative CSS paths to absolute URIs to match file change events
      const absoluteCSSUri = this.resolveAbsoluteCSSUri(documentUri, cssFileUri);

      let documents = this.importsByCSS.get(absoluteCSSUri);
      if (!documents) {
        documents = new Set();
        this.importsByCSS.set(absoluteCSSUri, documents);
      }
      documents.add(documentUri);
    }
  }

  /**
   * Resolve a relative CSS file URI to an absolute file URI
   *
   * @param documentUri - Absolute Eligian document URI (e.g., "file:///c%3A/projects/test.eligian")
   * @param cssFileUri - CSS file URI (may be relative like "./styles.css" or absolute)
   * @returns Absolute CSS file URI (e.g., "file:///c%3A/projects/styles.css")
   */
  private resolveAbsoluteCSSUri(documentUri: string, cssFileUri: string): string {
    // If already absolute, return as-is
    if (cssFileUri.startsWith('file://')) {
      return cssFileUri;
    }

    // Parse document URI to get directory
    const docUri = vscode.Uri.parse(documentUri);
    const docPath = docUri.fsPath;
    const docDir = docPath.substring(0, docPath.lastIndexOf('\\'));

    // Remove leading "./" from CSS path
    const cleanPath = cssFileUri.startsWith('./') ? cssFileUri.substring(2) : cssFileUri;

    // Combine directory with CSS path and convert to URI
    const absolutePath = `${docDir}\\${cleanPath}`;
    return vscode.Uri.file(absolutePath).toString();
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
   * T022: Send LSP notifications for validation hot-reload
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

      // T022: Send LSP notification for validation hot-reload
      if (this.client) {
        const cssFileUri = vscode.Uri.file(filePath).toString();
        const documentUris = Array.from(this.importsByCSS.get(cssFileUri) || []);

        if (documentUris.length > 0) {
          console.log(
            `[CSSWatcher] Sending LSP notification for ${cssFileUri} → ${documentUris.length} document(s)`
          );
          this.client.sendNotification(CSS_UPDATED_NOTIFICATION, {
            cssFileUri,
            documentUris,
          });
        }
      }

      // Invoke callback (async-safe) for preview hot-reload
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
