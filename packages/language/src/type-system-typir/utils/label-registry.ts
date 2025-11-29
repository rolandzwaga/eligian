/**
 * Label Registry Service
 *
 * Tracks available label IDs for each Eligian document, providing:
 * - Document-based label ID tracking (similar to CSS registry)
 * - Label metadata storage (translation count, language codes)
 * - Query API for validation and hover information
 * - Hot-reload support (updates when labels file changes)
 *
 * @module type-system-typir/utils/label-registry
 */

/**
 * Metadata for a single label group extracted from labels JSON
 */
export interface LabelGroupMetadata {
  /** Label group ID (e.g., "welcome-title") */
  id: string;

  /** Number of translations available */
  translationCount: number;

  /** Language codes for all translations (e.g., ["en-US", "nl-NL"]) */
  languageCodes: string[];
}

/**
 * Label Registry Service
 *
 * Centralized service for tracking label IDs per document, following the same
 * pattern as CSS registry for consistency.
 *
 * **Usage**:
 * ```typescript
 * // Update labels file metadata
 * registry.updateLabelsFile('file:///labels.json', [
 *   {id: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL']}
 * ]);
 *
 * // Register document import
 * registry.registerImports('file:///program.eligian', 'file:///labels.json');
 *
 * // Query label IDs
 * const exists = registry.hasLabelID('file:///program.eligian', 'welcome-title');
 * ```
 */
export class LabelRegistryService {
  /**
   * Map from labels file URI to label metadata
   * Stores the complete metadata for each label in a labels file
   */
  private labelsByFile: Map<string, LabelGroupMetadata[]> = new Map();

  /**
   * Map from document URI to labels file URI
   * Tracks which labels file each document imports
   */
  private labelsFileByDocument: Map<string, string> = new Map();

  /**
   * Update label metadata for a labels file
   *
   * This replaces all existing metadata for the file (hot-reload safe).
   *
   * @param fileUri - Absolute URI of the labels file (e.g., 'file:///labels.json')
   * @param metadata - Array of label group metadata
   *
   * @example
   * ```typescript
   * registry.updateLabelsFile('file:///labels.json', [
   *   {id: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL']},
   *   {id: 'button-text', translationCount: 1, languageCodes: ['en-US']}
   * ]);
   * ```
   */
  updateLabelsFile(fileUri: string, metadata: LabelGroupMetadata[]): void {
    this.labelsByFile.set(fileUri, metadata);
  }

  /**
   * Register which labels file a document imports
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @param labelsFileUri - Absolute URI of the imported labels file
   *
   * @example
   * ```typescript
   * registry.registerImports('file:///program.eligian', 'file:///labels.json');
   * ```
   */
  registerImports(documentUri: string, labelsFileUri: string): void {
    this.labelsFileByDocument.set(documentUri, labelsFileUri);
  }

  /**
   * Get all label IDs available for a document
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @returns Set of label IDs (empty if no labels imported)
   *
   * @example
   * ```typescript
   * const labelIDs = registry.getLabelIDsForDocument('file:///program.eligian');
   * // Returns: Set(['welcome-title', 'button-text'])
   * ```
   */
  getLabelIDsForDocument(documentUri: string): Set<string> {
    const labelsFileUri = this.labelsFileByDocument.get(documentUri);
    if (!labelsFileUri) {
      return new Set();
    }

    const metadata = this.labelsByFile.get(labelsFileUri);
    if (!metadata) {
      return new Set();
    }

    return new Set(metadata.map(m => m.id));
  }

  /**
   * Check if a label ID exists for a document
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @param labelId - Label ID to check
   * @returns True if label ID exists
   *
   * @example
   * ```typescript
   * const exists = registry.hasLabelID('file:///program.eligian', 'welcome-title');
   * // Returns: true
   * ```
   */
  hasLabelID(documentUri: string, labelId: string): boolean {
    const labelIDs = this.getLabelIDsForDocument(documentUri);
    return labelIDs.has(labelId);
  }

  /**
   * Find metadata for a specific label ID
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @param labelId - Label ID to find
   * @returns Label metadata if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const metadata = registry.findLabelMetadata('file:///program.eligian', 'welcome-title');
   * // Returns: {id: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL']}
   * ```
   */
  findLabelMetadata(documentUri: string, labelId: string): LabelGroupMetadata | undefined {
    const labelsFileUri = this.labelsFileByDocument.get(documentUri);
    if (!labelsFileUri) {
      return undefined;
    }

    const metadata = this.labelsByFile.get(labelsFileUri);
    if (!metadata) {
      return undefined;
    }

    return metadata.find(m => m.id === labelId);
  }

  /**
   * Check if a document has a labels import registered
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @returns True if document has imported a labels file
   *
   * @example
   * ```typescript
   * const hasImport = registry.hasImport('file:///program.eligian');
   * // Returns: true
   * ```
   */
  hasImport(documentUri: string): boolean {
    return this.labelsFileByDocument.has(documentUri);
  }

  /**
   * Get the labels file URI for a document
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @returns Labels file URI if registered, undefined otherwise
   *
   * @example
   * ```typescript
   * const labelsFileUri = registry.getLabelsFileUri('file:///program.eligian');
   * // Returns: 'file:///labels.json'
   * ```
   */
  getLabelsFileUri(documentUri: string): string | undefined {
    return this.labelsFileByDocument.get(documentUri);
  }

  /**
   * Clear all data for a document (on document close)
   *
   * @param documentUri - Absolute URI of the Eligian document
   *
   * @example
   * ```typescript
   * registry.clearDocument('file:///program.eligian');
   * ```
   */
  clearDocument(documentUri: string): void {
    this.labelsFileByDocument.delete(documentUri);
  }

  /**
   * Clear all registry data (for testing)
   *
   * @example
   * ```typescript
   * registry.clearAll();  // Reset registry to empty state
   * ```
   */
  clearAll(): void {
    this.labelsByFile.clear();
    this.labelsFileByDocument.clear();
  }
}
