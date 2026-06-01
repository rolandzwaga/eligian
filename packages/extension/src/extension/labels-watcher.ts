/**
 * Labels Watcher Manager
 *
 * Watches labels JSON files for changes and triggers validation hot-reload
 * without requiring a manual document save.
 *
 * Thin wrapper over {@link FileImportWatcherManager} (consolidation D1).
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import { LABELS_UPDATED_NOTIFICATION } from '@eligian/language';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { type FileChangeCallback, FileImportWatcherManager } from './base-watcher-manager.js';

/**
 * Manages file watching for labels hot-reload validation
 * (one-to-one document → labels file relationship).
 */
export class LabelsWatcherManager extends FileImportWatcherManager {
  /**
   * @param onChange - Callback invoked when a labels file changes (after debouncing)
   * @param client - Optional LanguageClient for sending LSP notifications
   */
  constructor(onChange: FileChangeCallback, client?: LanguageClient) {
    super(
      {
        globPattern: '**/*.json',
        sendUpdateNotification: (c, labelsFileUri, documentUris) => {
          c.sendNotification(LABELS_UPDATED_NOTIFICATION, { labelsFileUri, documentUris });
        },
      },
      onChange,
      client
    );
  }

  /**
   * Register which labels file an Eligian document imports (and start watching it).
   *
   * @param documentUri - Absolute Eligian document URI (file:///...)
   * @param labelsFileUri - Labels file URI imported by the document (may be relative)
   */
  registerImport(documentUri: string, labelsFileUri: string): void {
    this.registerImportsInternal(documentUri, [labelsFileUri]);
  }
}
