/**
 * Asset Loading Module
 *
 * Provides file loading, path resolution, and content validation for HTML, CSS, and media assets.
 *
 * @module asset-loading
 */

// Compiler integration

// Core interfaces
export type { IAssetLoader } from './interfaces.js';
// Implementations

// Type definitions
// Note: the asset-error discriminated union lives in the unified errors namespace
// (`../errors`). Import `AssetError` from there, not from this module.
export type { SourceLocation } from './types.js';
