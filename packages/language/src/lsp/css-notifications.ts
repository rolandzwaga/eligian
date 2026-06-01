import type { CSSParseError } from '../css/css-parser.js';
import type { AssetImportsDiscoveredParams, AssetUpdatedParams } from './asset-notifications.js';

/**
 * LSP Notification Types for CSS Validation
 *
 * These custom LSP notifications are sent from the VS Code extension to the language server
 * when CSS files change, enabling real-time validation updates.
 *
 * The param interfaces extend the shared bases in asset-notifications.ts (see D7).
 */

/**
 * Notification type for CSS file updates
 *
 * Sent when a CSS file is created, modified, or saved.
 * The language server should re-parse the CSS and update validation.
 */
export const CSS_UPDATED_NOTIFICATION = 'eligian/cssUpdated';

/**
 * Notification type for CSS file errors
 *
 * Sent when a CSS file cannot be read or has other issues.
 * The language server should mark the CSS as unavailable.
 */
export const CSS_ERROR_NOTIFICATION = 'eligian/cssError';

/**
 * Parameters for CSS updated notification
 *
 * Sent from extension when a CSS file changes.
 */
export interface CSSUpdatedParams extends AssetUpdatedParams {
  /**
   * URI of the CSS file that changed
   * - Example: "file:///f:/projects/app/styles.css"
   */
  cssFileUri: string;
}

/**
 * Parameters for CSS error notification
 *
 * Sent from extension when a CSS file has errors.
 */
export interface CSSErrorParams {
  /**
   * URI of the CSS file with errors
   */
  cssFileUri: string;

  /**
   * Parse errors encountered in the CSS file
   */
  errors: CSSParseError[];
}

/**
 * Notification type for CSS imports discovered
 *
 * Sent from language server to extension when a document's CSS imports are parsed.
 * The extension uses this to track which documents import which CSS files for hot-reload validation.
 */
export const CSS_IMPORTS_DISCOVERED_NOTIFICATION = 'eligian/cssImportsDiscovered';

/**
 * Parameters for CSS imports discovered notification
 *
 * Sent from language server to extension when CSS imports are discovered in a document.
 */
export interface CSSImportsDiscoveredParams extends AssetImportsDiscoveredParams {
  /**
   * URIs of all CSS files imported by this document
   * - In import order
   * - Empty array if no CSS imports
   */
  cssFileUris: string[];
}
