/**
 * LSP Notification Types for Labels Validation
 *
 * These custom LSP notifications are sent from the VS Code extension to the language server
 * when labels JSON files change, enabling real-time validation updates.
 *
 * Pattern: Mirrors css-notifications.ts for consistency
 */

/**
 * Notification type for labels file updates
 *
 * Sent when a labels JSON file is created, modified, or saved.
 * The language server should re-parse the labels and update validation.
 */
export const LABELS_UPDATED_NOTIFICATION = 'eligian/labelsUpdated';

/**
 * Parameters for labels updated notification
 *
 * Sent from extension when a labels file changes.
 */
export interface LabelsUpdatedParams {
  /**
   * URI of the labels file that changed
   * - Example: "file:///f:/projects/app/labels.json"
   */
  labelsFileUri: string;

  /**
   * URIs of all Eligian documents that import this labels file
   * - Used to determine which documents need re-validation
   * - Empty array if no documents import this labels file
   */
  documentUris: string[];
}

/**
 * Notification type for labels imports discovered
 *
 * Sent from language server to extension when a document's labels import is parsed.
 * The extension uses this to track which documents import which labels files for hot-reload validation.
 */
export const LABELS_IMPORTS_DISCOVERED_NOTIFICATION = 'eligian/labelsImportsDiscovered';

/**
 * Parameters for labels imports discovered notification
 *
 * Sent from language server to extension when labels import is discovered in a document.
 */
export interface LabelsImportsDiscoveredParams {
  /**
   * URI of the Eligian document
   * - Example: "file:///f:/projects/app/presentation.eligian"
   */
  documentUri: string;

  /**
   * URI of the labels file imported by this document
   * - Empty string if no labels import
   */
  labelsFileUri: string;
}
