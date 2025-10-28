/**
 * CSS Loader Utilities
 *
 * Thin wrappers around @eligian/language CSS service for VS Code extension integration.
 * Most functionality delegated to language package (Feature 017 - Phase 2).
 */

// Import from language package (Feature 017)
import {
  type FileNotFoundError,
  generateCSSId as generateCSSIdInternal,
  loadCSS as loadCSSInternal,
  type PermissionError,
  type ReadError,
  rewriteUrls as rewriteUrlsInternal,
} from '@eligian/language';
import type { IEngineConfiguration } from 'eligius';
import type * as vscode from 'vscode';
import { VSCodeWebviewUriConverter } from './webview-uri-converter.js';

/**
 * Extended Eligius configuration with cssFiles support (Feature 010)
 */
export interface IEngineConfigurationWithCSS extends IEngineConfiguration {
  cssFiles?: string[];
}

/**
 * Re-export error types from language package for backwards compatibility
 */
export type { FileNotFoundError, PermissionError, ReadError };

/**
 * Generate stable unique identifier from file path using SHA-256 hash
 *
 * Delegates to @eligian/language CSS service (Feature 017).
 *
 * @param filePath - Absolute file system path to CSS file
 * @returns 16-character hex string (SHA-256 hash truncated)
 *
 * @example
 * generateCSSId('/workspace/styles/main.css') // 'a3f5b2c8d9e1f4b7'
 */
export function generateCSSId(filePath: string): string {
  return generateCSSIdInternal(filePath);
}

/**
 * Rewrite CSS url() paths to webview URIs for images/fonts
 *
 * Delegates to @eligian/language CSS service (Feature 017).
 *
 * @param css - CSS file content
 * @param cssFilePath - Absolute path to CSS file (for resolving relative paths)
 * @param webview - VS Code webview instance
 * @returns CSS content with rewritten url() paths
 *
 * @example
 * const css = ".bg { background: url('./image.png'); }";
 * rewriteCSSUrls(css, '/workspace/styles/main.css', webview);
 * // ".bg { background: url('vscode-webview://.../styles/image.png'); }"
 */
export function rewriteCSSUrls(css: string, cssFilePath: string, webview: vscode.Webview): string {
  const converter = new VSCodeWebviewUriConverter(webview);
  return rewriteUrlsInternal(css, cssFilePath, converter);
}

/**
 * Load CSS file content from disk with error handling
 *
 * Delegates to @eligian/language CSS service (Feature 017).
 *
 * @param filePath - Absolute path to CSS file
 * @returns CSS file content (UTF-8)
 * @throws Error with typed error information if file cannot be read
 *
 * @example
 * const css = await loadCSSFile('/workspace/styles/main.css');
 */
export async function loadCSSFile(filePath: string): Promise<string> {
  // Use dummy webview converter (we only need content, not URL rewriting)
  const dummyConverter = {
    convertToWebviewUri: (uri: any) => uri,
  };

  const result = await loadCSSInternal(filePath, dummyConverter as any);
  return result.content;
}

/**
 * T008: Extract CSS file paths from compiled Eligius configuration
 *
 * @param config - Compiled Eligius configuration from compiler
 * @returns Array of CSS file paths (relative to Eligian document)
 *
 * @example
 * const config = await compile(source, { sourceUri: docPath });
 * const cssFiles = extractCSSFiles(config);
 * // ['./styles/main.css', './styles/theme.css']
 */
export function extractCSSFiles(config: IEngineConfigurationWithCSS): string[] {
  console.log('[css-loader] extractCSSFiles called with config:', {
    hasCssFiles: 'cssFiles' in config,
    cssFilesValue: config.cssFiles,
    cssFilesType: typeof config.cssFiles,
  });
  return config.cssFiles || [];
}
