/**
 * HTML Watcher Manager
 *
 * Watches HTML/layout files for changes and triggers validation hot-reload
 * without requiring manual document save. Uses a single FileSystemWatcher
 * with per-file debouncing to handle rapid file changes (e.g., auto-save).
 *
 * Pattern: Mirrors labels-watcher.ts for consistency (one-to-one relationship)
 * Constitution Principle I: Simplicity & Documentation
 */

import * as path from 'node:path';
import { HTML_UPDATED_NOTIFICATION } from '@eligian/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

/**
 * Callback invoked when an HTML file changes after debouncing
 */
type HTMLChangeCallback = (filePath: string) => void | Promise<void>;

/**
 * Manages file watching for HTML layout hot-reload validation
 *
 * Design:
 * - Single FileSystemWatcher for all HTML files (efficient)
 * - Per-file debouncing (300ms) to handle auto-save
 * - Independent timers for each file (parallel editing support)
 * - Reverse mapping: HTML file URI → documents that import it (for LSP notifications)
 * - Graceful cleanup on disposal
 */
export class HTMLWatcherManager {
  private watcher: vscode.FileSystemWatcher | null = null;
  private trackedFiles = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceDelay = 300; // milliseconds
  private readonly onChange: HTMLChangeCallback;
  private disposables: vscode.Disposable[] = [];

  // LSP notification support for validation hot-reload
  private client: LanguageClient | null = null;
  private importsByHTMLFile = new Map<string, Set<string>>(); // HTML file URI → Set<document URIs>

  /**
   * Create a new HTML watcher manager
   *
   * @param onChange - Callback invoked when HTML file changes (after debouncing)
   * @param client - Optional LanguageClient for sending LSP notifications
   */
  constructor(onChange: HTMLChangeCallback, client?: LanguageClient) {
    this.onChange = onChange;
    this.client = client || null;
  }

  /**
   * Register which HTML file an Eligian document imports
   *
   * Builds reverse mapping: HTML file URI → Set of document URIs that import it.
   * Used to determine which documents need re-validation when an HTML file changes.
   *
   * This method also automatically starts watching the HTML file if not already watching.
   *
   * **Important**: This method clears any previous import for this document before
   * registering new ones. This ensures stale mappings (e.g., from renamed files) are removed.
   *
   * @param documentUri - Absolute Eligian document URI (file:///...)
   * @param htmlFileUri - HTML file URI imported by the document (may be relative like "./layout.html")
   */
  registerImport(documentUri: string, htmlFileUri: string): void {
    // CRITICAL: Clear old mappings for this document first
    // This prevents stale entries when HTML paths are corrected after being invalid
    this.clearDocumentMappings(documentUri);

    if (!htmlFileUri) {
      return;
    }

    // Parse document URI to get workspace root
    const docUri = vscode.Uri.parse(documentUri);
    const docPath = docUri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(docUri);
    const workspaceRoot = workspaceFolder?.uri.fsPath || require('node:path').dirname(docPath);

    // Convert relative HTML path to absolute URI to match file change events
    const absoluteHTMLUri = this.resolveAbsoluteHTMLUri(documentUri, htmlFileUri);

    let documents = this.importsByHTMLFile.get(absoluteHTMLUri);
    if (!documents) {
      documents = new Set();
      this.importsByHTMLFile.set(absoluteHTMLUri, documents);
    }
    documents.add(documentUri);

    // Extract file path for watching
    const htmlUri = vscode.Uri.parse(absoluteHTMLUri);
    const htmlFilePath = htmlUri.fsPath;

    // Start watching the HTML file (this is idempotent - won't recreate watcher if already exists)
    this.startWatching([htmlFilePath], workspaceRoot);
  }

  /**
   * Clear all HTML import mappings for a specific document
   *
   * Removes the document from all HTML file → document mappings.
   * Used when document imports change or document is closed.
   *
   * @param documentUri - Absolute Eligian document URI
   */
  private clearDocumentMappings(documentUri: string): void {
    // Iterate through all HTML file mappings and remove this document
    for (const [htmlFileUri, documents] of this.importsByHTMLFile.entries()) {
      documents.delete(documentUri);
      // Clean up empty sets to prevent memory leaks
      if (documents.size === 0) {
        this.importsByHTMLFile.delete(htmlFileUri);
      }
    }
  }

  /**
   * Resolve a relative HTML file URI to an absolute file URI
   *
   * @param documentUri - Absolute Eligian document URI (e.g., "file:///c%3A/projects/test.eligian")
   * @param htmlFileUri - HTML file URI (may be relative like "./layout.html" or absolute)
   * @returns Absolute HTML file URI (e.g., "file:///c%3A/projects/layout.html")
   */
  private resolveAbsoluteHTMLUri(documentUri: string, htmlFileUri: string): string {
    // If already absolute, return as-is
    if (htmlFileUri.startsWith('file://')) {
      return htmlFileUri;
    }

    // Parse document URI to get directory
    const docUri = vscode.Uri.parse(documentUri);
    const docPath = docUri.fsPath;
    const docDir = path.dirname(docPath);

    // Remove leading "./" from HTML path
    const cleanPath = htmlFileUri.startsWith('./') ? htmlFileUri.substring(2) : htmlFileUri;

    // Combine directory with HTML path and convert to URI (cross-platform)
    const absolutePath = path.join(docDir, cleanPath);
    return vscode.Uri.file(absolutePath).toString();
  }

  /**
   * Start watching HTML files for changes
   *
   * Creates a FileSystemWatcher for the workspace and tracks specified HTML files.
   * File changes are debounced per-file to handle rapid saves.
   *
   * @param htmlFiles - Array of HTML file paths to watch (relative to workspace)
   * @param workspaceRoot - Workspace root directory
   */
  startWatching(htmlFiles: string[], workspaceRoot: string): void {
    if (htmlFiles.length === 0) {
      return;
    }

    // Update tracked files
    this.updateTrackedFiles(htmlFiles);

    // Create watcher if it doesn't exist
    if (!this.watcher) {
      // Watch all HTML files in workspace (efficient single watcher)
      const pattern = new vscode.RelativePattern(workspaceRoot, '**/*.html');
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
    }
  }

  /**
   * Update the set of tracked files without recreating the watcher
   *
   * @param htmlFiles - New array of HTML file paths to track
   */
  updateTrackedFiles(htmlFiles: string[]): void {
    for (const file of htmlFiles) {
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

    this.debounceChange(filePath);
  }

  /**
   * Handle file deletion event (private helper)
   */
  private handleFileDelete(uri: vscode.Uri): void {
    const filePath = uri.fsPath;

    if (this.trackedFiles.has(filePath)) {
      this.trackedFiles.delete(filePath);

      // Clear any pending debounce timer
      const timer = this.debounceTimers.get(filePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(filePath);
      }

      // Send LSP notification to trigger re-validation with empty HTML
      if (this.client) {
        const htmlFileUri = vscode.Uri.file(filePath).toString();
        const documentUris = Array.from(this.importsByHTMLFile.get(htmlFileUri) || []);

        if (documentUris.length > 0) {
          this.client.sendNotification(HTML_UPDATED_NOTIFICATION, {
            htmlFileUri,
            documentUris,
          });
        }
      }
    }
  }

  /**
   * Debounce file change events per-file with 300ms delay
   * Send LSP notifications for validation hot-reload
   *
   * Uses independent timers for each file to support parallel editing.
   * This handles auto-save scenarios where files are saved multiple times
   * in quick succession.
   *
   * @param filePath - Absolute path to HTML file that changed
   */
  private debounceChange(filePath: string): void {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Create new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);

      // Send LSP notification for validation hot-reload
      if (this.client) {
        const htmlFileUri = vscode.Uri.file(filePath).toString();
        const documentUris = Array.from(this.importsByHTMLFile.get(htmlFileUri) || []);

        if (documentUris.length > 0) {
          this.client.sendNotification(HTML_UPDATED_NOTIFICATION, {
            htmlFileUri,
            documentUris,
          });
        }
      }

      // Invoke callback (async-safe)
      Promise.resolve(this.onChange(filePath)).catch(_error => {
        // Error in onChange callback - silently ignore
      });
    }, this.debounceDelay);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Dispose the watcher and clean up resources
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
  }
}
