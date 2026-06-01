/**
 * CSS Watcher Manager
 *
 * Watches CSS files for changes and triggers hot-reload without restarting
 * the Eligius engine, plus LSP notifications so validation can be re-triggered.
 *
 * Thin wrapper over {@link FileImportWatcherManager} (consolidation D1).
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import { CSS_UPDATED_NOTIFICATION } from '@eligian/language';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { type FileChangeCallback, FileImportWatcherManager } from './base-watcher-manager.js';

/**
 * Manages file watching for CSS hot-reload and validation hot-reload.
 *
 * CSS-specific behavior (vs HTML/Labels): reacts to file-create events and
 * notifies on delete even for untracked files, to support files being renamed
 * back to a name documents import.
 */
export class CSSWatcherManager extends FileImportWatcherManager {
  /**
   * @param onChange - Callback invoked when a CSS file changes (after debouncing)
   * @param client - Optional LanguageClient for sending LSP notifications
   */
  constructor(onChange: FileChangeCallback, client?: LanguageClient) {
    super(
      {
        globPattern: '**/*.css',
        watchCreate: true,
        notifyOnDeleteWhenUntracked: true,
        sendUpdateNotification: (c, cssFileUri, documentUris) => {
          c.sendNotification(CSS_UPDATED_NOTIFICATION, { cssFileUri, documentUris });
        },
      },
      onChange,
      client
    );
  }

  /**
   * Register which CSS files an Eligian document imports (and start watching them).
   *
   * @param documentUri - Absolute Eligian document URI (file:///...)
   * @param cssFileUris - CSS file URIs imported by the document (may be relative)
   */
  registerImports(documentUri: string, cssFileUris: string[]): void {
    this.registerImportsInternal(documentUri, cssFileUris);
  }
}
