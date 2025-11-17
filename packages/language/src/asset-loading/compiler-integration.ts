/**
 * Compiler Integration for Asset Loading
 *
 * This module provides integration points for connecting asset validation
 * to the compiler pipeline. It's designed to be used by external code
 * (CLI, LSP, etc.) that has access to source file paths.
 *
 * @module asset-loading/compiler-integration
 */

import { dirname, resolve } from 'node:path';
import type { Program } from '../generated/ast.js';
import { isDefaultImport, isNamedImport } from '../utils/ast-helpers.js';
import { getFileExtension } from '../utils/path-utils.js';
import { getImports } from '../utils/program-helpers.js';
import { AssetValidationService } from './asset-validation-service.js';
import { CssValidator } from './css-validator.js';
import { HtmlValidator } from './html-validator.js';
import type { AssetError, IAssetLoader, SourceLocation } from './index.js';
import { MediaValidator } from './media-validator.js';
import { NodeAssetLoader } from './node-asset-loader.js';

/**
 * Asset loading result
 *
 * Contains loaded asset content and any validation errors.
 */
export interface AssetLoadingResult {
  /**
   * Loaded layout HTML (from 'layout' import), or undefined if not present
   */
  layoutTemplate?: string;

  /**
   * CSS file paths (relative) from 'styles' and named CSS imports
   */
  cssFiles: string[];

  /**
   * Import map containing all loaded assets
   * - layout: HTML content
   * - styles: CSS content
   * - provider: Media file path
   * - named imports: Content or paths
   */
  importMap: Record<string, string>;

  /**
   * Validation errors encountered during asset loading
   */
  errors: AssetError[];
}

/**
 * Import information extracted from AST
 */
interface ImportInfo {
  type: 'layout' | 'styles' | 'provider' | 'named';
  keyword?: 'layout' | 'styles' | 'provider';
  name?: string;
  path: string;
  assetType: 'html' | 'css' | 'media';
  sourceLocation: SourceLocation;
}

/**
 * Create default asset validation service
 *
 * @returns Configured AssetValidationService with all validators
 */
export function createAssetValidationService(): AssetValidationService {
  return new AssetValidationService(
    new NodeAssetLoader(),
    new HtmlValidator(),
    new CssValidator(),
    new MediaValidator()
  );
}

/**
 * Load and validate assets from an Eligian program
 *
 * This function:
 * 1. Extracts import statements from the AST
 * 2. Resolves relative paths to absolute paths
 * 3. Loads and validates each asset
 * 4. Returns loaded content and any errors
 *
 * @param program - Parsed Langium AST
 * @param sourceFilePath - Absolute path to the source .eligian file
 * @param service - Optional AssetValidationService (creates default if not provided)
 * @param assetLoader - Optional IAssetLoader (creates NodeAssetLoader if not provided)
 * @returns Asset loading result with content and errors
 *
 * @example
 * ```typescript
 * const program = parseSource(source);
 * const result = loadProgramAssets(program, '/path/to/main.eligian');
 *
 * if (result.errors.length > 0) {
 *   // Handle validation errors
 *   for (const error of result.errors) {
 *     console.error(error.message);
 *   }
 * }
 *
 * // Use loaded assets in compilation
 * const config = {
 *   layoutTemplate: result.layoutTemplate,
 *   cssFiles: result.cssFiles,
 *   // ... rest of config
 * };
 * ```
 */
export function loadProgramAssets(
  program: Program,
  sourceFilePath: string,
  service?: AssetValidationService,
  assetLoader?: IAssetLoader
): AssetLoadingResult {
  // Create service if not provided
  const validationService = service || createAssetValidationService();

  // Initialize result
  const result: AssetLoadingResult = {
    layoutTemplate: undefined,
    cssFiles: [],
    importMap: {},
    errors: [],
  };

  // Extract import information from AST
  const imports = extractImports(program, sourceFilePath);

  // Get source directory for resolving relative paths
  const sourceDir = dirname(sourceFilePath);
  const loader = assetLoader || new NodeAssetLoader();

  // Process each import
  for (const importInfo of imports) {
    try {
      // Resolve relative path to absolute
      const absolutePath = resolve(sourceDir, importInfo.path);

      // Validate asset
      const errors = validationService.validateAsset(
        importInfo.assetType,
        absolutePath,
        sourceFilePath,
        importInfo.path
      );

      // Collect errors
      result.errors.push(...errors);

      // If validation passed, load content
      if (errors.length === 0) {
        const content = loader.loadFile(absolutePath);

        // Store based on import type
        if (importInfo.type === 'layout') {
          result.layoutTemplate = content;
          result.importMap.layout = content;
        } else if (importInfo.type === 'styles') {
          // CSS paths stay relative
          result.cssFiles.push(importInfo.path);
          result.importMap.styles = content;
        } else if (importInfo.type === 'provider') {
          // Provider path stays relative
          result.importMap.provider = importInfo.path;
        } else if (importInfo.type === 'named' && importInfo.name) {
          // Named imports
          if (importInfo.assetType === 'css') {
            result.cssFiles.push(importInfo.path);
          }
          result.importMap[importInfo.name] = content;
        }
      }
    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        type: 'load-error',
        filePath: importInfo.path,
        absolutePath: resolve(sourceDir, importInfo.path),
        sourceLocation: importInfo.sourceLocation,
        message: `Failed to load asset: ${errorMessage}`,
        hint: 'Check file path and permissions',
      });
    }
  }

  return result;
}

/**
 * Infer asset type from import statement
 *
 * Uses a combination of:
 * 1. Explicit `as type` clause (if present)
 * 2. Default import keyword (layout → html, styles → css, provider → media)
 * 3. File extension inference (fallback)
 *
 * @param importStmt - Import statement AST node
 * @returns Inferred asset type
 */
function inferImportAssetType(
  importStmt: import('../generated/ast.js').ImportStatement
): 'html' | 'css' | 'media' {
  // Default imports: infer from keyword
  if (isDefaultImport(importStmt)) {
    if (importStmt.type === 'layout') return 'html';
    if (importStmt.type === 'styles') return 'css';
    if (importStmt.type === 'provider') return 'media';
  }

  // Named imports: use explicit type or infer from extension
  if (isNamedImport(importStmt)) {
    // Explicit type override
    if (importStmt.assetType) {
      return importStmt.assetType;
    }

    // Infer from file extension
    const ext = getFileExtension(importStmt.path);
    if (ext === 'html') return 'html';
    if (ext === 'css') return 'css';
    if (ext === 'mp4' || ext === 'webm' || ext === 'mp3' || ext === 'wav') return 'media';
  }

  // Default to media (safest assumption for unknown)
  return 'media';
}

/**
 * Extract import information from Program AST
 *
 * Traverses the AST to collect all import statements with their metadata,
 * including path, type, and source location.
 *
 * @param program - Parsed Program AST
 * @param sourceFilePath - Source file path for error reporting
 * @returns Array of import information
 */
function extractImports(program: Program, sourceFilePath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const importStatements = getImports(program);

  for (const importStmt of importStatements) {
    // Get source location
    const sourceLocation: SourceLocation = {
      file: sourceFilePath,
      line: importStmt.$cstNode?.range.start.line ?? 0,
      column: importStmt.$cstNode?.range.start.character ?? 0,
    };

    // Process default imports (layout, styles, provider)
    if (isDefaultImport(importStmt)) {
      const keyword = importStmt.type; // 'layout' | 'styles' | 'provider'
      const assetType = inferImportAssetType(importStmt);

      imports.push({
        type: keyword,
        keyword,
        path: importStmt.path,
        assetType,
        sourceLocation,
      });
    }
    // Process named imports
    else if (isNamedImport(importStmt)) {
      const assetType = inferImportAssetType(importStmt);

      imports.push({
        type: 'named',
        name: importStmt.name,
        path: importStmt.path,
        assetType,
        sourceLocation,
      });
    }
  }

  return imports;
}

/**
 * Check if a Program has any import statements
 *
 * @param program - Parsed Program AST
 * @returns true if program contains imports
 */
export function hasImports(program: Program): boolean {
  return getImports(program).length > 0;
}
