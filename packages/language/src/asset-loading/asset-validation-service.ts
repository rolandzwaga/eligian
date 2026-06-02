/**
 * Asset Validation Service Implementation
 *
 * Orchestrates HTML, CSS, and media file validation.
 */

import type { AssetError, SourceLocation } from '../errors/index.js';
import {
  createCssImportError,
  createCssParseError,
  createHtmlImportError,
  createLocalesImportError,
  createMediaImportError,
} from '../errors/index.js';
import type {
  IAssetLoader,
  IAssetValidationService,
  ICssValidator,
  IHtmlValidator,
  IMediaValidator,
} from './interfaces.js';

/**
 * Asset Validation Service
 *
 * Provides unified validation for all asset types (HTML, CSS, media).
 * Coordinates file loading, content validation, and error reporting.
 */
export class AssetValidationService implements IAssetValidationService {
  constructor(
    private readonly assetLoader: IAssetLoader,
    private readonly htmlValidator: IHtmlValidator,
    private readonly cssValidator: ICssValidator,
    private readonly mediaValidator: IMediaValidator
  ) {}

  /**
   * Validate an asset file
   *
   * @param assetType - Type of asset ('html', 'css', 'media', 'json')
   * @param absolutePath - Absolute path to the asset file
   * @param sourcePath - Absolute path to the source .eligian file (for error reporting)
   * @param relativePath - Relative path from import statement (for error reporting)
   * @returns Array of asset errors (empty if valid)
   */
  validateAsset(
    assetType: 'html' | 'css' | 'media' | 'json',
    absolutePath: string,
    sourcePath: string,
    relativePath: string
  ): AssetError[] {
    // Create source location for error reporting
    const sourceLocation: SourceLocation = {
      file: sourcePath,
      line: 0, // Will be populated by validator calling this service
      column: 0,
    };

    // Check if file exists
    if (!this.assetLoader.fileExists(absolutePath)) {
      return [this.buildMissingFileError(assetType, relativePath, absolutePath, sourceLocation)];
    }

    // Validate based on asset type
    switch (assetType) {
      case 'html':
        return this.validateHtml(absolutePath, relativePath, sourceLocation);

      case 'css':
        return this.validateCss(absolutePath, relativePath, sourceLocation);

      case 'media':
        return this.validateMedia(absolutePath, relativePath, sourceLocation);

      case 'json':
        // JSON validation (locales schema) is handled by loadProgramAssets /
        // label-import-validator. Existence was already checked above.
        return [];

      default:
        // Unknown asset type (unreachable for the typed union, kept defensive)
        return [
          createMediaImportError({
            filePath: relativePath,
            absolutePath,
            message: `Unknown asset type: ${assetType}`,
            location: sourceLocation,
            hint: 'Asset type must be html, css, media, or json',
          }),
        ];
    }
  }

  /**
   * Build the per-asset-type "file not found" import error.
   *
   * The missing-file check is shared across all asset types, but each type maps
   * to its own discriminated-union member so downstream consumers can branch on
   * `_tag`.
   */
  private buildMissingFileError(
    assetType: 'html' | 'css' | 'media' | 'json',
    relativePath: string,
    absolutePath: string,
    location: SourceLocation
  ): AssetError {
    const base = {
      filePath: relativePath,
      absolutePath,
      location,
      message: `Asset file not found: ${relativePath}`,
      hint: 'Check that the file path is correct and the file exists',
    };

    switch (assetType) {
      case 'html':
        return createHtmlImportError(base);
      case 'css':
        return createCssImportError(base);
      case 'json':
        return createLocalesImportError(base);
      default:
        return createMediaImportError(base);
    }
  }

  /**
   * Validate HTML content
   */
  private validateHtml(
    absolutePath: string,
    relativePath: string,
    sourceLocation: SourceLocation
  ): AssetError[] {
    return this.validateContentFile(
      absolutePath,
      content => this.htmlValidator.validate(content),
      validationError =>
        createHtmlImportError({
          filePath: relativePath,
          absolutePath,
          location: sourceLocation,
          message: `HTML validation error: ${validationError.message}`,
          hint: validationError.hint,
          line: validationError.line,
          column: validationError.column,
        }),
      message =>
        createHtmlImportError({
          filePath: relativePath,
          absolutePath,
          location: sourceLocation,
          message: `Failed to load HTML file: ${message}`,
          hint: 'Check file permissions and encoding (should be UTF-8)',
        })
    );
  }

  /**
   * Validate CSS content
   */
  private validateCss(
    absolutePath: string,
    relativePath: string,
    sourceLocation: SourceLocation
  ): AssetError[] {
    return this.validateContentFile(
      absolutePath,
      content => this.cssValidator.validate(content),
      // CSS syntax/validation failures carry line/column → CssParseError.
      validationError =>
        createCssParseError({
          filePath: absolutePath,
          message: `CSS validation error: ${validationError.message}`,
          hint: validationError.hint,
          line: validationError.line,
          column: validationError.column,
        }),
      message =>
        createCssImportError({
          filePath: relativePath,
          absolutePath,
          location: sourceLocation,
          message: `Failed to load CSS file: ${message}`,
          hint: 'Check file permissions and encoding (should be UTF-8)',
        })
    );
  }

  /**
   * Validate a text-based asset file (HTML or CSS).
   *
   * D24: the HTML and CSS validation paths were byte-for-byte identical apart
   * from the validator invoked and the union member emitted. This generic helper
   * is the single source of truth; {@link validateHtml}/{@link validateCss} are
   * thin wrappers supplying the validator and the two error builders (one for a
   * content-validation failure, one for a file-load failure).
   *
   * @param validate - The content validator (HTML or CSS) to run
   * @param buildContentError - Builds the union member for a validation failure
   * @param buildLoadError - Builds the union member for a file-load failure
   */
  private validateContentFile(
    absolutePath: string,
    validate: (content: string) => {
      valid: boolean;
      errors: ReadonlyArray<{ message: string; hint: string; line: number; column: number }>;
    },
    buildContentError: (validationError: {
      message: string;
      hint: string;
      line: number;
      column: number;
    }) => AssetError,
    buildLoadError: (message: string) => AssetError
  ): AssetError[] {
    const errors: AssetError[] = [];

    try {
      const content = this.assetLoader.loadFile(absolutePath);
      const result = validate(content);

      if (!result.valid) {
        for (const validationError of result.errors) {
          errors.push(buildContentError(validationError));
        }
      }
    } catch (error) {
      // File load error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(buildLoadError(errorMessage));
    }

    return errors;
  }

  /**
   * Validate media file (existence only)
   */
  private validateMedia(
    absolutePath: string,
    relativePath: string,
    sourceLocation: SourceLocation
  ): AssetError[] {
    const errors: AssetError[] = [];

    // Validate media file (existence check)
    const result = this.mediaValidator.validate(absolutePath);

    if (!result.valid) {
      // Convert media validation errors to MediaImportErrors
      for (const mediaError of result.errors) {
        errors.push(
          createMediaImportError({
            filePath: relativePath,
            absolutePath: mediaError.absolutePath,
            location: sourceLocation,
            message: mediaError.message,
            hint: mediaError.hint,
          })
        );
      }
    }

    return errors;
  }
}
