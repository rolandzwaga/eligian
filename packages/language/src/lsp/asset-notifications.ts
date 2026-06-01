/**
 * Shared LSP Notification Base Types for Asset Validation
 *
 * The CSS, HTML, and labels notification modules all follow the same shape:
 * an "updated" notification (an asset file changed, telling the language server
 * which documents must be re-validated) and an "imports discovered" notification
 * (the language server telling the extension which asset files a document imports).
 *
 * These base interfaces capture the fields common to every asset kind. The
 * asset-specific modules ([css|html|labels]-notifications.ts) extend them with
 * their own file-URI field(s), whose name and cardinality differ per asset
 * (e.g. CSS imports-discovered carries an array `cssFileUris`, whereas labels and
 * HTML carry a single `*FileUri`).
 */

/**
 * Common parameters for an asset "updated" notification.
 *
 * Sent from extension when an asset file changes. Asset-specific modules extend
 * this with the changed file's URI (e.g. `cssFileUri`, `htmlFileUri`, `labelsFileUri`).
 */
export interface AssetUpdatedParams {
  /**
   * URIs of all Eligian documents that import the changed asset file
   * - Used to determine which documents need re-validation
   * - Empty array if no documents import this asset file
   */
  documentUris: string[];
}

/**
 * Common parameters for an asset "imports discovered" notification.
 *
 * Sent from the language server to the extension when a document's imports of a
 * given asset kind are parsed. Asset-specific modules extend this with the
 * imported file URI(s) (e.g. `cssFileUris`, `htmlFileUri`, `labelsFileUri`).
 */
export interface AssetImportsDiscoveredParams {
  /**
   * URI of the Eligian document
   * - Example: "file:///f:/projects/app/presentation.eligian"
   */
  documentUri: string;
}
