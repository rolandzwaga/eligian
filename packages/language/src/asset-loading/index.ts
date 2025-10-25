/**
 * Asset Loading Module
 *
 * Provides file loading, path resolution, and content validation for HTML, CSS, and media assets.
 *
 * @module asset-loading
 */

export { AssetValidationService } from './asset-validation-service.js';
// Compiler integration
export {
  type AssetLoadingResult,
  createAssetValidationService,
  hasImports,
  loadProgramAssets,
} from './compiler-integration.js';
export { CssValidator } from './css-validator.js';
export { HtmlValidator } from './html-validator.js';
// Core interfaces
export type {
  IAssetLoader,
  IAssetValidationService,
  ICssValidator,
  IHtmlValidator,
  IMediaValidator,
} from './interfaces.js';
export { MediaValidator } from './media-validator.js';
// Implementations
export { NodeAssetLoader } from './node-asset-loader.js';
// Type definitions
export type {
  AssetError,
  CssValidationError,
  CssValidationResult,
  HtmlValidationError,
  HtmlValidationResult,
  MediaValidationError,
  MediaValidationResult,
  SourceLocation,
} from './types.js';
