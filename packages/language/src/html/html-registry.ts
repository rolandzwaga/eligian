/**
 * HTML Registry Service
 *
 * Tracks HTML content for each Eligian document, providing:
 * - Document-based HTML tracking (similar to CSS and labels registries)
 * - HTML content storage
 * - Query API for validation and preview
 * - Hot-reload support (updates when HTML file changes)
 *
 * @module html/html-registry
 */

/**
 * Metadata for HTML content extracted from layout files
 */
interface HTMLMetadata {
  /** Raw HTML content */
  content: string;

  /** Parse errors (if any) */
  errors?: Array<{
    message: string;
    line?: number;
    column?: number;
  }>;
}

/**
 * HTML Registry Service
 *
 * Centralized service for tracking HTML content per document, following the same
 * pattern as CSS and labels registries for consistency.
 *
 * **Usage**:
 * ```typescript
 * // Update HTML file metadata
 * registry.updateHTMLFile('file:///layout.html', {
 *   content: '<div class="container">...</div>',
 *   errors: []
 * });
 *
 * // Register document import
 * registry.registerImports('file:///program.eligian', 'file:///layout.html');
 *
 * // Query HTML content
 * const content = registry.getHTMLForDocument('file:///program.eligian');
 * ```
 */
export class HTMLRegistryService {
  /**
   * Map from HTML file URI to HTML metadata
   * Stores the complete metadata for each HTML file
   */
  private htmlByFile: Map<string, HTMLMetadata> = new Map();

  /**
   * Map from document URI to HTML file URI
   * Tracks which HTML file each document imports (one-to-one relationship)
   */
  private htmlFileByDocument: Map<string, string> = new Map();

  /**
   * Update HTML metadata for an HTML file
   *
   * This replaces all existing metadata for the file (hot-reload safe).
   *
   * @param fileUri - Absolute URI of the HTML file (e.g., 'file:///layout.html')
   * @param metadata - HTML metadata
   *
   * @example
   * ```typescript
   * registry.updateHTMLFile('file:///layout.html', {
   *   content: '<div class="main">...</div>',
   *   errors: []
   * });
   * ```
   */
  updateHTMLFile(fileUri: string, metadata: HTMLMetadata): void {
    this.htmlByFile.set(fileUri, metadata);
  }

  /**
   * Register which HTML file a document imports
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @param htmlFileUri - Absolute URI of the imported HTML file
   *
   * @example
   * ```typescript
   * registry.registerImports('file:///program.eligian', 'file:///layout.html');
   * ```
   */
  registerImports(documentUri: string, htmlFileUri: string): void {
    this.htmlFileByDocument.set(documentUri, htmlFileUri);
  }

  /**
   * Check if a document has an HTML import registered
   *
   * Used for loop prevention - prevents sending duplicate notifications
   * when re-validating documents.
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @returns true if document has HTML import registered
   */
  hasImport(documentUri: string): boolean {
    return this.htmlFileByDocument.has(documentUri);
  }

  /**
   * Get HTML content for a document
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @returns HTML metadata or undefined if no HTML imported
   *
   * @example
   * ```typescript
   * const html = registry.getHTMLForDocument('file:///program.eligian');
   * if (html) {
   *   console.log('HTML content:', html.content);
   * }
   * ```
   */
  getHTMLForDocument(documentUri: string): HTMLMetadata | undefined {
    const htmlFileUri = this.htmlFileByDocument.get(documentUri);
    if (!htmlFileUri) {
      return undefined;
    }
    return this.htmlByFile.get(htmlFileUri);
  }

  /**
   * Get HTML file URI for a document
   *
   * @param documentUri - Absolute URI of the Eligian document
   * @returns HTML file URI or undefined if no HTML imported
   */
  getHTMLFileURI(documentUri: string): string | undefined {
    return this.htmlFileByDocument.get(documentUri);
  }

  /**
   * Get all documents that import a specific HTML file
   *
   * Used when HTML file changes to determine which documents need re-validation.
   *
   * @param htmlFileUri - Absolute URI of the HTML file
   * @returns Array of document URIs that import this HTML file
   *
   * @example
   * ```typescript
   * const docs = registry.getDocumentsForHTMLFile('file:///layout.html');
   * // Re-validate each document
   * for (const docUri of docs) {
   *   revalidate(docUri);
   * }
   * ```
   */
  getDocumentsForHTMLFile(htmlFileUri: string): string[] {
    const documents: string[] = [];
    for (const [docUri, fileUri] of this.htmlFileByDocument.entries()) {
      if (fileUri === htmlFileUri) {
        documents.push(docUri);
      }
    }
    return documents;
  }

  /**
   * Check if an HTML file has errors
   *
   * @param fileUri - Absolute URI of the HTML file
   * @returns true if file has parse errors
   */
  hasErrors(fileUri: string): boolean {
    const metadata = this.htmlByFile.get(fileUri);
    return !!metadata?.errors && metadata.errors.length > 0;
  }

  /**
   * Get errors for an HTML file
   *
   * @param fileUri - Absolute URI of the HTML file
   * @returns Array of parse errors
   */
  getErrors(fileUri: string): Array<{ message: string; line?: number; column?: number }> {
    const metadata = this.htmlByFile.get(fileUri);
    return metadata?.errors || [];
  }

  /**
   * Clear all data for a document
   *
   * Called when a document is closed or deleted.
   *
   * @param documentUri - Absolute URI of the Eligian document
   */
  clearDocument(documentUri: string): void {
    this.htmlFileByDocument.delete(documentUri);
  }

  /**
   * Clear all data for an HTML file
   *
   * Called when an HTML file is deleted.
   *
   * @param fileUri - Absolute URI of the HTML file
   */
  clearHTMLFile(fileUri: string): void {
    this.htmlByFile.delete(fileUri);
    // Remove any document imports of this file
    for (const [docUri, htmlUri] of this.htmlFileByDocument.entries()) {
      if (htmlUri === fileUri) {
        this.htmlFileByDocument.delete(docUri);
      }
    }
  }
}
