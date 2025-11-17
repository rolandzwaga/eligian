/**
 * Asset Validation Service Implementation
 *
 * Orchestrates HTML, CSS, and media file validation.
 */

import type {
  IAssetLoader,
  IAssetValidationService,
  ICssValidator,
  IHtmlValidator,
  IMediaValidator,
} from './interfaces.js';
import type { AssetError, SourceLocation } from './types.js';

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
    const errors: AssetError[] = [];

    // Create source location for error reporting
    const sourceLocation: SourceLocation = {
      file: sourcePath,
      line: 0, // Will be populated by validator calling this service
      column: 0,
    };

    // Check if file exists
    if (!this.assetLoader.fileExists(absolutePath)) {
      errors.push({
        type: 'missing-file',
        filePath: relativePath,
        absolutePath,
        sourceLocation,
        message: `Asset file not found: ${relativePath}`,
        hint: 'Check that the file path is correct and the file exists',
      });
      return errors;
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
        // JSON validation is handled separately by label-import-validator
        // Just verify file exists (already done above)
        return errors;

      default:
        // Unknown asset type
        errors.push({
          type: 'load-error',
          filePath: relativePath,
          absolutePath,
          sourceLocation,
          message: `Unknown asset type: ${assetType}`,
          hint: 'Asset type must be html, css, media, or json',
        });
        return errors;
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
    const errors: AssetError[] = [];

    try {
      // Load HTML content
      const htmlContent = this.assetLoader.loadFile(absolutePath);

      // Validate HTML syntax
      const result = this.htmlValidator.validate(htmlContent);

      if (!result.valid) {
        // Convert HTML validation errors to AssetErrors
        for (const htmlError of result.errors) {
          errors.push({
            type: 'invalid-html',
            filePath: relativePath,
            absolutePath,
            sourceLocation,
            message: `HTML validation error: ${htmlError.message}`,
            hint: htmlError.hint,
            details: `Line ${htmlError.line}, Column ${htmlError.column}`,
          });
        }
      }
    } catch (error) {
      // File load error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        type: 'load-error',
        filePath: relativePath,
        absolutePath,
        sourceLocation,
        message: `Failed to load HTML file: ${errorMessage}`,
        hint: 'Check file permissions and encoding (should be UTF-8)',
      });
    }

    return errors;
  }

  /**
   * Validate CSS content
   */
  private validateCss(
    absolutePath: string,
    relativePath: string,
    sourceLocation: SourceLocation
  ): AssetError[] {
    const errors: AssetError[] = [];

    try {
      // Load CSS content
      const cssContent = this.assetLoader.loadFile(absolutePath);

      // Validate CSS syntax
      const result = this.cssValidator.validate(cssContent);

      if (!result.valid) {
        // Convert CSS validation errors to AssetErrors
        for (const cssError of result.errors) {
          errors.push({
            type: 'invalid-css',
            filePath: relativePath,
            absolutePath,
            sourceLocation,
            message: `CSS validation error: ${cssError.message}`,
            hint: cssError.hint,
            details: `Line ${cssError.line}, Column ${cssError.column}`,
          });
        }
      }
    } catch (error) {
      // File load error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        type: 'load-error',
        filePath: relativePath,
        absolutePath,
        sourceLocation,
        message: `Failed to load CSS file: ${errorMessage}`,
        hint: 'Check file permissions and encoding (should be UTF-8)',
      });
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
      // Convert media validation errors to AssetErrors
      for (const mediaError of result.errors) {
        errors.push({
          type: 'missing-file',
          filePath: relativePath,
          absolutePath: mediaError.absolutePath,
          sourceLocation,
          message: mediaError.message,
          hint: mediaError.hint,
        });
      }
    }

    return errors;
  }
}
