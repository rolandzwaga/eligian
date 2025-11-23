/**
 * Label Registry Service Interface
 *
 * Centralized service for tracking available label IDs per document.
 * Follows the CSS registry pattern for consistency.
 */
export interface LabelRegistryService {
  /**
   * Update label metadata for a labels JSON file
   * Replaces existing metadata if file was already registered
   *
   * @param fileUri - Absolute URI to labels JSON file
   * @param metadata - Extracted label group metadata
   */
  updateLabelsFile(fileUri: string, metadata: LabelGroupMetadata[]): void;

  /**
   * Register which labels file a document imports
   * Establishes document → labels file linkage
   *
   * @param documentUri - Absolute URI to Eligian document
   * @param labelsFileUri - Absolute URI to labels JSON file
   */
  registerImports(documentUri: string, labelsFileUri: string): void;

  /**
   * Get all label IDs available for a document
   * Returns label IDs from the document's imported labels file
   *
   * @param documentUri - Absolute URI to Eligian document
   * @returns Set of label group IDs, or empty set if no import
   */
  getLabelIDsForDocument(documentUri: string): Set<string>;

  /**
   * Find metadata for a specific label ID in a document's context
   *
   * @param documentUri - Absolute URI to Eligian document
   * @param labelId - Label group ID to find
   * @returns Label metadata if found, undefined otherwise
   */
  findLabelMetadata(documentUri: string, labelId: string): LabelGroupMetadata | undefined;

  /**
   * Check if a label ID exists for a document
   *
   * @param documentUri - Absolute URI to Eligian document
   * @param labelId - Label group ID to check
   * @returns True if label ID exists in document's context
   */
  hasLabelID(documentUri: string, labelId: string): boolean;

  /**
   * Clear all data for a document (called when document closes)
   *
   * @param documentUri - Absolute URI to Eligian document
   */
  clearDocument(documentUri: string): void;
}
