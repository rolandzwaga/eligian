/**
 * Asset Loading Interfaces
 *
 * Core interfaces for asset loading and validation.
 */

import type {
  AssetError,
  CssValidationResult,
  HtmlValidationResult,
  MediaValidationResult,
} from './types.js';

/**
 * Asset Loader Interface
 *
 * Provides file system operations for loading and resolving asset paths.
 */
export interface IAssetLoader {
  /**
   * Check if a file exists at the given absolute path
   *
   * @param absolutePath - Absolute path to check
   * @returns true if file exists and is a file (not directory), false otherwise
   */
  fileExists(absolutePath: string): boolean;

  /**
   * Load file contents from absolute path
   *
   * @param absolutePath - Absolute path to the file
   * @returns File contents as UTF-8 string
   * @throws Error if file doesn't exist or can't be read
   */
  loadFile(absolutePath: string): string;

  /**
   * Resolve a relative path from a source file to an absolute path
   *
   * @param sourcePath - Absolute path to the source .eligian file
   * @param relativePath - Relative path from the import statement
   * @returns Absolute path to the target file
   *
   * @example
   * ```typescript
   * const loader = new NodeAssetLoader();
   * const sourcePath = '/project/src/main.eligian';
   * const relativePath = './layout.html';
   * const absolutePath = loader.resolvePath(sourcePath, relativePath);
   * // Result: '/project/src/layout.html'
   * ```
   */
  resolvePath(sourcePath: string, relativePath: string): string;
}

/**
 * HTML Validator Interface
 *
 * Provides HTML syntax validation.
 */
export interface IHtmlValidator {
  /**
   * Validate HTML content
   *
   * @param html - HTML content as string
   * @returns Validation result with errors if any
   */
  validate(html: string): HtmlValidationResult;
}

/**
 * CSS Validator Interface
 *
 * Provides CSS syntax validation.
 */
export interface ICssValidator {
  /**
   * Validate CSS content
   *
   * @param css - CSS content as string
   * @returns Validation result with errors if any
   */
  validate(css: string): CssValidationResult;
}

/**
 * Media File Validator Interface
 *
 * Provides media file existence validation.
 * Note: Content/format validation is out of scope.
 */
export interface IMediaValidator {
  /**
   * Validate media file (check existence only)
   *
   * @param absolutePath - Absolute path to media file
   * @returns Validation result with errors if file doesn't exist
   */
  validate(absolutePath: string): MediaValidationResult;
}

/**
 * Asset Validation Service Interface
 *
 * Orchestrates all asset validation (HTML, CSS, media).
 * Provides unified interface for validating any asset type.
 */
export interface IAssetValidationService {
  /**
   * Validate an asset file
   *
   * @param assetType - Type of asset ('html', 'css', 'media')
   * @param absolutePath - Absolute path to the asset file
   * @param sourcePath - Absolute path to the source .eligian file (for error reporting)
   * @param relativePath - Relative path from import statement (for error reporting)
   * @returns Array of asset errors (empty if valid)
   */
  validateAsset(
    assetType: 'html' | 'css' | 'media',
    absolutePath: string,
    sourcePath: string,
    relativePath: string
  ): AssetError[];
}
