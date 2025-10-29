import type { CSSParseError, CSSParseResult, CSSSourceLocation } from './css-parser.js';

/**
 * CSSMetadata represents all parsed information from a single CSS file
 */
export interface CSSMetadata {
  classes: Set<string>;
  ids: Set<string>;
  classLocations: Map<string, CSSSourceLocation>;
  idLocations: Map<string, CSSSourceLocation>;
  classRules: Map<string, string>;
  idRules: Map<string, string>;
  errors: CSSParseError[];
}

/**
 * CSSRegistryService is a Langium service that maintains a centralized registry
 * of all parsed CSS metadata across the workspace.
 *
 * It provides query methods for validators to check CSS class and ID availability
 * for each Eligian document based on its CSS imports.
 */
export class CSSRegistryService {
  /**
   * Map of CSS file URI → parsed metadata
   * - Updated when CSS files change
   * - Cleared when CSS files are deleted
   */
  private metadataByFile = new Map<string, CSSMetadata>();

  /**
   * Map of Eligian document URI → imported CSS file URIs
   * - Updated when .eligian files are parsed
   * - Used to determine which CSS classes are available to each document
   */
  private importsByDocument = new Map<string, Set<string>>();

  /**
   * Update CSS file metadata in the registry.
   *
   * Called when:
   * - CSS file is created or modified (LSP notification)
   * - CSS file is parsed for the first time
   *
   * Behavior:
   * - Replaces existing metadata for the file (if any)
   *
   * @param fileUri - Absolute file URI (e.g., "file:///f:/projects/app/styles.css")
   * @param metadata - Parsed CSS metadata (classes, IDs, locations, rules, errors)
   */
  updateCSSFile(fileUri: string, metadata: CSSParseResult): void {
    this.metadataByFile.set(fileUri, {
      classes: metadata.classes,
      ids: metadata.ids,
      classLocations: metadata.classLocations,
      idLocations: metadata.idLocations,
      classRules: metadata.classRules,
      idRules: metadata.idRules,
      errors: metadata.errors,
    });
  }

  /**
   * Get metadata for a specific CSS file.
   *
   * @param fileUri - Absolute file URI
   * @returns CSS metadata or undefined if file has not been parsed
   */
  getMetadata(fileUri: string): CSSMetadata | undefined {
    return this.metadataByFile.get(fileUri);
  }

  /**
   * Remove CSS file from the registry.
   *
   * Called when:
   * - CSS file is deleted
   * - Workspace is cleaned up
   *
   * @param fileUri - Absolute file URI
   */
  removeCSSFile(fileUri: string): void {
    this.metadataByFile.delete(fileUri);
  }

  /**
   * Register which CSS files an Eligian document imports.
   *
   * Called when:
   * - Eligian document is parsed
   * - CSS import statements are extracted from AST
   *
   * Behavior:
   * - Replaces existing imports for the document
   *
   * @param documentUri - Absolute Eligian document URI
   * @param cssFileUris - Absolute CSS file URIs (in import order)
   */
  registerImports(documentUri: string, cssFileUris: string[]): void {
    this.importsByDocument.set(documentUri, new Set(cssFileUris));
  }

  /**
   * Get CSS imports for an Eligian document.
   *
   * Returns:
   * - Set of CSS file URIs imported by the document (in registration order)
   * - Empty set if document has no CSS imports registered
   *
   * @param documentUri - Absolute Eligian document URI
   * @returns Set of CSS file URIs
   */
  getDocumentImports(documentUri: string): Set<string> {
    return this.importsByDocument.get(documentUri) || new Set();
  }

  /**
   * Get all CSS classes available to an Eligian document.
   *
   * Returns:
   * - Union of all classes from imported CSS files
   * - Empty set if document has no CSS imports
   * - Empty set if imported CSS files have not been parsed yet
   *
   * Note: Duplicates across files are de-duplicated (CSS cascade applies at runtime).
   *
   * @param documentUri - Absolute Eligian document URI
   * @returns Set of class names (without leading '.')
   */
  getClassesForDocument(documentUri: string): Set<string> {
    const classes = new Set<string>();
    const cssFileUris = this.importsByDocument.get(documentUri);

    if (!cssFileUris) {
      return classes;
    }

    for (const cssFileUri of cssFileUris) {
      const metadata = this.metadataByFile.get(cssFileUri);
      if (metadata) {
        for (const className of metadata.classes) {
          classes.add(className);
        }
      }
    }

    return classes;
  }

  /**
   * Get all CSS IDs available to an Eligian document.
   *
   * Returns:
   * - Union of all IDs from imported CSS files
   * - Empty set if document has no CSS imports
   *
   * @param documentUri - Absolute Eligian document URI
   * @returns Set of ID names (without leading '#')
   */
  getIDsForDocument(documentUri: string): Set<string> {
    const ids = new Set<string>();
    const cssFileUris = this.importsByDocument.get(documentUri);

    if (!cssFileUris) {
      return ids;
    }

    for (const cssFileUri of cssFileUris) {
      const metadata = this.metadataByFile.get(cssFileUri);
      if (metadata) {
        for (const idName of metadata.ids) {
          ids.add(idName);
        }
      }
    }

    return ids;
  }

  /**
   * Find the definition location of a CSS class.
   *
   * Returns:
   * - Source location of first class definition (if exists in imported CSS)
   * - undefined if class does not exist or CSS files not parsed
   *
   * Behavior:
   * - Searches all imported CSS files for the document
   * - Returns location from first file that defines the class (import order)
   *
   * Use case: "Go to Definition" feature (Spec 2)
   *
   * @param documentUri - Absolute Eligian document URI
   * @param className - CSS class name (without leading '.')
   * @returns Source location or undefined
   */
  findClassLocation(documentUri: string, className: string): CSSSourceLocation | undefined {
    const cssFileUris = this.importsByDocument.get(documentUri);

    if (!cssFileUris) {
      return undefined;
    }

    for (const cssFileUri of cssFileUris) {
      const metadata = this.metadataByFile.get(cssFileUri);
      if (metadata) {
        const location = metadata.classLocations.get(className);
        if (location) {
          return location;
        }
      }
    }

    return undefined;
  }

  /**
   * Find the definition location of a CSS ID.
   *
   * @param documentUri - Absolute Eligian document URI
   * @param idName - CSS ID name (without leading '#')
   * @returns Source location or undefined
   */
  findIDLocation(documentUri: string, idName: string): CSSSourceLocation | undefined {
    const cssFileUris = this.importsByDocument.get(documentUri);

    if (!cssFileUris) {
      return undefined;
    }

    for (const cssFileUri of cssFileUris) {
      const metadata = this.metadataByFile.get(cssFileUri);
      if (metadata) {
        const location = metadata.idLocations.get(idName);
        if (location) {
          return location;
        }
      }
    }

    return undefined;
  }

  /**
   * Get the CSS rule text for a class.
   *
   * Returns:
   * - Full CSS rule text (e.g., ".button { color: blue; }")
   * - undefined if class does not exist or CSS files not parsed
   *
   * Use case: Hover preview feature (Spec 2)
   *
   * @param documentUri - Absolute Eligian document URI
   * @param className - CSS class name (without leading '.')
   * @returns CSS rule text or undefined
   */
  getClassRule(documentUri: string, className: string): string | undefined {
    const cssFileUris = this.importsByDocument.get(documentUri);

    if (!cssFileUris) {
      return undefined;
    }

    for (const cssFileUri of cssFileUris) {
      const metadata = this.metadataByFile.get(cssFileUri);
      if (metadata) {
        const rule = metadata.classRules.get(className);
        if (rule) {
          return rule;
        }
      }
    }

    return undefined;
  }

  /**
   * Get the CSS rule text for an ID.
   *
   * @param documentUri - Absolute Eligian document URI
   * @param idName - CSS ID name (without leading '#')
   * @returns CSS rule text or undefined
   */
  getIDRule(documentUri: string, idName: string): string | undefined {
    const cssFileUris = this.importsByDocument.get(documentUri);

    if (!cssFileUris) {
      return undefined;
    }

    for (const cssFileUri of cssFileUris) {
      const metadata = this.metadataByFile.get(cssFileUri);
      if (metadata) {
        const rule = metadata.idRules.get(idName);
        if (rule) {
          return rule;
        }
      }
    }

    return undefined;
  }

  /**
   * Check if a CSS file has parse errors.
   *
   * @param fileUri - Absolute CSS file URI
   * @returns true if file has syntax errors, false otherwise
   */
  hasErrors(fileUri: string): boolean {
    const metadata = this.metadataByFile.get(fileUri);
    return metadata ? metadata.errors.length > 0 : false;
  }

  /**
   * Get parse errors for a CSS file.
   *
   * @param fileUri - Absolute CSS file URI
   * @returns Array of parse errors (empty if no errors or file not parsed)
   */
  getErrors(fileUri: string): CSSParseError[] {
    const metadata = this.metadataByFile.get(fileUri);
    return metadata ? metadata.errors : [];
  }

  /**
   * Clear all metadata for a document.
   *
   * Called when:
   * - Document is closed or re-compiled
   * - Ensuring state isolation between compilations
   *
   * Behavior:
   * - Removes import tracking for the document
   * - Removes CSS file metadata if no other documents reference it (reference counting)
   * - Keeps CSS file metadata if other documents still import it (shared files)
   * - Operation is idempotent (clearing non-existent document is no-op)
   *
   * @param documentUri - Absolute Eligian document URI
   */
  clearDocument(documentUri: string): void {
    const imports = this.importsByDocument.get(documentUri);

    // Remove document's import registration
    this.importsByDocument.delete(documentUri);

    if (!imports) {
      return; // Document not registered, nothing to do
    }

    // Check each imported CSS file for lingering references
    for (const cssFileUri of imports) {
      const stillReferenced = Array.from(this.importsByDocument.values()).some(importSet =>
        importSet.has(cssFileUri)
      );

      // If no other documents reference this CSS file, remove it
      if (!stillReferenced) {
        this.metadataByFile.delete(cssFileUri);
      }
    }
  }

  /**
   * Reset entire CSS registry state.
   *
   * Called when:
   * - IDE workspace is closed
   * - Compiler process restarts
   * - Test suite needs clean state
   *
   * Behavior:
   * - Clears all document import registrations
   * - Clears all CSS file metadata
   * - Operation is idempotent (clearing empty registry is no-op)
   */
  clearAll(): void {
    this.importsByDocument.clear();
    this.metadataByFile.clear();
  }
}
