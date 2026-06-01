/**
 * HTML Watcher Manager
 *
 * Watches HTML/layout files for changes and triggers validation hot-reload
 * without requiring a manual document save.
 *
 * Thin wrapper over {@link FileImportWatcherManager} (consolidation D1).
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import { HTML_UPDATED_NOTIFICATION } from '@eligian/language';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { type FileChangeCallback, FileImportWatcherManager } from './base-watcher-manager.js';

/**
 * Manages file watching for HTML layout hot-reload validation
 * (one-to-one document → HTML file relationship).
 */
export class HTMLWatcherManager extends FileImportWatcherManager {
  /**
   * @param onChange - Callback invoked when an HTML file changes (after debouncing)
   * @param client - Optional LanguageClient for sending LSP notifications
   */
  constructor(onChange: FileChangeCallback, client?: LanguageClient) {
    super(
      {
        globPattern: '**/*.html',
        sendUpdateNotification: (c, htmlFileUri, documentUris) => {
          c.sendNotification(HTML_UPDATED_NOTIFICATION, { htmlFileUri, documentUris });
        },
      },
      onChange,
      client
    );
  }

  /**
   * Register which HTML file an Eligian document imports (and start watching it).
   *
   * @param documentUri - Absolute Eligian document URI (file:///...)
   * @param htmlFileUri - HTML file URI imported by the document (may be relative)
   */
  registerImport(documentUri: string, htmlFileUri: string): void {
    this.registerImportsInternal(documentUri, [htmlFileUri]);
  }
}
