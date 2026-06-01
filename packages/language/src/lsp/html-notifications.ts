import type { AssetImportsDiscoveredParams, AssetUpdatedParams } from './asset-notifications.js';

/**
 * LSP Notification Types for HTML/Layout Validation
 *
 * These custom LSP notifications are sent from the VS Code extension to the language server
 * when HTML/layout files change, enabling real-time validation updates.
 *
 * Pattern: Mirrors css-notifications.ts and labels-notifications.ts for consistency; param
 * interfaces extend the shared bases in asset-notifications.ts (see D7).
 */

/**
 * Notification type for HTML file updates
 *
 * Sent when an HTML/layout file is created, modified, or saved.
 * The language server should re-parse the HTML and update validation.
 */
export const HTML_UPDATED_NOTIFICATION = 'eligian/htmlUpdated';

/**
 * Parameters for HTML updated notification
 *
 * Sent from extension when an HTML file changes.
 */
export interface HTMLUpdatedParams extends AssetUpdatedParams {
  /**
   * URI of the HTML file that changed
   * - Example: "file:///f:/projects/app/layout.html"
   */
  htmlFileUri: string;
}

/**
 * Notification type for HTML imports discovered
 *
 * Sent from language server to extension when a document's HTML/layout import is parsed.
 * The extension uses this to track which documents import which HTML files for hot-reload validation.
 */
export const HTML_IMPORTS_DISCOVERED_NOTIFICATION = 'eligian/htmlImportsDiscovered';

/**
 * Parameters for HTML imports discovered notification
 *
 * Sent from language server to extension when HTML import is discovered in a document.
 */
export interface HTMLImportsDiscoveredParams extends AssetImportsDiscoveredParams {
  /**
   * URI of the HTML file imported by this document
   * - Empty string if no HTML import
   */
  htmlFileUri: string;
}
