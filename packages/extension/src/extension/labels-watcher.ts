/**
 * Labels Watcher Manager
 *
 * Watches labels JSON files for changes and triggers validation hot-reload
 * without requiring manual document save. Uses a single FileSystemWatcher
 * with per-file debouncing to handle rapid file changes (e.g., auto-save).
 *
 * Pattern: Mirrors css-watcher.ts for consistency
 * Constitution Principle I: Simplicity & Documentation
 */

import * as path from 'node:path';
import { LABELS_UPDATED_NOTIFICATION } from '@eligian/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

/**
 * Callback invoked when a labels file changes after debouncing
 */
export type LabelsChangeCallback = (filePath: string) => void | Promise<void>;

/**
 * Manages file watching for labels hot-reload validation
 *
 * Design:
 * - Single FileSystemWatcher for all labels files (efficient)
 * - Per-file debouncing (300ms) to handle auto-save
 * - Independent timers for each file (parallel editing support)
 * - Reverse mapping: labels file URI → documents that import it (for LSP notifications)
 * - Graceful cleanup on disposal
 */
export class LabelsWatcherManager {
  private watcher: vscode.FileSystemWatcher | null = null;
  private trackedFiles = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceDelay = 300; // milliseconds
  private readonly onChange: LabelsChangeCallback;
  private disposables: vscode.Disposable[] = [];

  // LSP notification support for validation hot-reload
  private client: LanguageClient | null = null;
  private importsByLabelsFile = new Map<string, Set<string>>(); // labels file URI → Set<document URIs>

  /**
   * Create a new labels watcher manager
   *
   * @param onChange - Callback invoked when labels file changes (after debouncing)
   * @param client - Optional LanguageClient for sending LSP notifications
   */
  constructor(onChange: LabelsChangeCallback, client?: LanguageClient) {
    this.onChange = onChange;
    this.client = client || null;
  }

  /**
   * Register which labels file an Eligian document imports
   *
   * Builds reverse mapping: labels file URI → Set of document URIs that import it.
   * Used to determine which documents need re-validation when a labels file changes.
   *
   * This method also automatically starts watching the labels file if not already watching.
   *
   * **Important**: This method clears any previous import for this document before
   * registering new ones. This ensures stale mappings (e.g., from renamed files) are removed.
   *
   * @param documentUri - Absolute Eligian document URI (file:///...)
   * @param labelsFileUri - Labels file URI imported by the document (may be relative like "./labels.json")
   */
  registerImport(documentUri: string, labelsFileUri: string): void {
    console.error(
      `[LabelsWatcher] registerImport called: doc=${documentUri}, labels=${labelsFileUri}`
    );

    // CRITICAL: Clear old mappings for this document first
    // This prevents stale entries when labels paths are corrected after being invalid
    this.clearDocumentMappings(documentUri);

    if (!labelsFileUri) {
      return;
    }

    // Parse document URI to get workspace root
    const docUri = vscode.Uri.parse(documentUri);
    const docPath = docUri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(docUri);
    const workspaceRoot = workspaceFolder?.uri.fsPath || require('node:path').dirname(docPath);

    // Convert relative labels path to absolute URI to match file change events
    const absoluteLabelsUri = this.resolveAbsoluteLabelsUri(documentUri, labelsFileUri);
    console.error(`[LabelsWatcher] Resolved to absolute URI: ${absoluteLabelsUri}`);

    let documents = this.importsByLabelsFile.get(absoluteLabelsUri);
    if (!documents) {
      documents = new Set();
      this.importsByLabelsFile.set(absoluteLabelsUri, documents);
    }
    documents.add(documentUri);

    // Extract file path for watching
    const labelsUri = vscode.Uri.parse(absoluteLabelsUri);
    const labelsFilePath = labelsUri.fsPath;
    console.error(`[LabelsWatcher] Will watch file path: ${labelsFilePath}`);

    // Start watching the labels file (this is idempotent - won't recreate watcher if already exists)
    this.startWatching([labelsFilePath], workspaceRoot);
  }

  /**
   * Clear all labels import mappings for a specific document
   *
   * Removes the document from all labels file → document mappings.
   * Used when document imports change or document is closed.
   *
   * @param documentUri - Absolute Eligian document URI
   */
  private clearDocumentMappings(documentUri: string): void {
    // Iterate through all labels file mappings and remove this document
    for (const [labelsFileUri, documents] of this.importsByLabelsFile.entries()) {
      documents.delete(documentUri);
      // Clean up empty sets to prevent memory leaks
      if (documents.size === 0) {
        this.importsByLabelsFile.delete(labelsFileUri);
      }
    }
  }

  /**
   * Resolve a relative labels file URI to an absolute file URI
   *
   * @param documentUri - Absolute Eligian document URI (e.g., "file:///c%3A/projects/test.eligian")
   * @param labelsFileUri - Labels file URI (may be relative like "./labels.json" or absolute)
   * @returns Absolute labels file URI (e.g., "file:///c%3A/projects/labels.json")
   */
  private resolveAbsoluteLabelsUri(documentUri: string, labelsFileUri: string): string {
    // If already absolute, return as-is
    if (labelsFileUri.startsWith('file://')) {
      return labelsFileUri;
    }

    // Parse document URI to get directory
    const docUri = vscode.Uri.parse(documentUri);
    const docPath = docUri.fsPath;
    const docDir = path.dirname(docPath);

    // Remove leading "./" from labels path
    const cleanPath = labelsFileUri.startsWith('./') ? labelsFileUri.substring(2) : labelsFileUri;

    // Combine directory with labels path and convert to URI (cross-platform)
    const absolutePath = path.join(docDir, cleanPath);
    return vscode.Uri.file(absolutePath).toString();
  }

  /**
   * Start watching labels files for changes
   *
   * Creates a FileSystemWatcher for the workspace and tracks specified labels files.
   * File changes are debounced per-file to handle rapid saves.
   *
   * @param labelsFiles - Array of labels file paths to watch (relative to workspace)
   * @param workspaceRoot - Workspace root directory
   */
  startWatching(labelsFiles: string[], workspaceRoot: string): void {
    if (labelsFiles.length === 0) {
      return;
    }

    // Update tracked files
    this.updateTrackedFiles(labelsFiles);

    // Create watcher if it doesn't exist
    if (!this.watcher) {
      // Watch all JSON files in workspace (efficient single watcher)
      const pattern = new vscode.RelativePattern(workspaceRoot, '**/*.json');
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
   * @param labelsFiles - New array of labels file paths to track
   */
  updateTrackedFiles(labelsFiles: string[]): void {
    for (const file of labelsFiles) {
      this.trackedFiles.add(file);
    }
  }

  /**
   * Handle file change event (private helper)
   */
  private handleFileChange(uri: vscode.Uri): void {
    const filePath = uri.fsPath;
    console.error(`[LabelsWatcher] handleFileChange: ${filePath}`);
    console.error(`[LabelsWatcher] trackedFiles has: ${Array.from(this.trackedFiles).join(', ')}`);

    // Only process tracked files
    if (!this.trackedFiles.has(filePath)) {
      console.error(`[LabelsWatcher] File not tracked, ignoring`);
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

      // Send LSP notification to trigger re-validation with empty labels
      if (this.client) {
        const labelsFileUri = vscode.Uri.file(filePath).toString();
        const documentUris = Array.from(this.importsByLabelsFile.get(labelsFileUri) || []);

        if (documentUris.length > 0) {
          this.client.sendNotification(LABELS_UPDATED_NOTIFICATION, {
            labelsFileUri,
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
   * @param filePath - Absolute path to labels file that changed
   */
  private debounceChange(filePath: string): void {
    console.error(`[LabelsWatcher] debounceChange called for: ${filePath}`);

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
        const labelsFileUri = vscode.Uri.file(filePath).toString();
        const documentUris = Array.from(this.importsByLabelsFile.get(labelsFileUri) || []);

        console.error(
          `[LabelsWatcher] Sending LABELS_UPDATED for ${labelsFileUri}, docs: ${documentUris.length}`
        );

        if (documentUris.length > 0) {
          this.client.sendNotification(LABELS_UPDATED_NOTIFICATION, {
            labelsFileUri,
            documentUris,
          });
        } else {
          console.error(`[LabelsWatcher] No importing documents found for ${labelsFileUri}`);
        }
      } else {
        console.error('[LabelsWatcher] No language client available');
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
