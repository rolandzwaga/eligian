/**
 * CSS Loader Utilities
 *
 * Pure functions for loading CSS files, converting paths, and rewriting URLs
 * for webview compatibility.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IEngineConfiguration } from 'eligius';
import * as vscode from 'vscode';

/**
 * Extended Eligius configuration with cssFiles support (Feature 010)
 */
export interface IEngineConfigurationWithCSS extends IEngineConfiguration {
  cssFiles?: string[];
}

/**
 * Custom error types for CSS loading failures
 */
export class FileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`CSS file not found: ${filePath}`);
    this.name = 'FileNotFoundError';
  }
}

export class PermissionError extends Error {
  constructor(filePath: string) {
    super(`Permission denied reading CSS file: ${filePath}`);
    this.name = 'PermissionError';
  }
}

export class ReadError extends Error {
  public readonly cause: Error;

  constructor(
    public readonly filePath: string,
    cause: Error
  ) {
    super(`Failed to read CSS file: ${filePath} (${cause.message})`);
    this.name = 'ReadError';
    this.cause = cause;
  }
}

/**
 * T004: Generate stable unique identifier from file path using SHA-256 hash
 *
 * @param filePath - Absolute file system path to CSS file
 * @returns 16-character hex string (SHA-256 hash truncated)
 *
 * @example
 * generateCSSId('/workspace/styles/main.css') // 'a3f5b2c8d9e1f4b7'
 */
export function generateCSSId(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(filePath);
  return hash.digest('hex').substring(0, 16);
}

/**
 * T005: Convert file system path to webview-compatible URI
 *
 * @param filePath - Absolute file system path
 * @param webview - VS Code webview instance
 * @returns Webview URI (vscode-webview:// protocol)
 *
 * @example
 * convertToWebviewUri('/workspace/image.png', webview)
 * // Uri { scheme: 'vscode-webview', ... }
 */
export function convertToWebviewUri(filePath: string, webview: vscode.Webview): vscode.Uri {
  const fileUri = vscode.Uri.file(filePath);
  return webview.asWebviewUri(fileUri);
}

/**
 * T006: Rewrite CSS url() paths to webview URIs for images/fonts
 *
 * Converts relative paths in CSS (like url(./image.png)) to webview URIs
 * so assets load correctly in the webview context.
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
  const cssDir = path.dirname(cssFilePath);

  // Match url(...) patterns in CSS
  // Handles: url(./file), url("./file"), url('../file'), url('file')
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;

  return css.replace(urlRegex, (match, urlPath) => {
    // Skip absolute URLs (http://, https://, data:)
    if (
      urlPath.startsWith('http://') ||
      urlPath.startsWith('https://') ||
      urlPath.startsWith('data:')
    ) {
      return match;
    }

    // Resolve relative path to absolute
    const absolutePath = path.resolve(cssDir, urlPath);

    // Normalize Windows paths (CSS doesn't accept backslashes)
    const normalizedPath = absolutePath.replace(/\\/g, '/');

    // Convert to webview URI
    const webviewUri = convertToWebviewUri(normalizedPath, webview);

    return `url('${webviewUri.toString()}')`;
  });
}

/**
 * T007: Load CSS file content from disk with error handling
 *
 * @param filePath - Absolute path to CSS file
 * @returns CSS file content (UTF-8)
 * @throws {FileNotFoundError} If file doesn't exist
 * @throws {PermissionError} If insufficient permissions to read
 * @throws {ReadError} If file read fails for other reasons
 *
 * @example
 * const css = await loadCSSFile('/workspace/styles/main.css');
 */
export async function loadCSSFile(filePath: string): Promise<string> {
  try {
    // Check if file exists
    await fs.access(filePath, fs.constants.R_OK);

    // Read file content
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    if (error instanceof Error) {
      // File not found
      if ('code' in error && error.code === 'ENOENT') {
        throw new FileNotFoundError(filePath);
      }

      // Permission denied
      if ('code' in error && (error.code === 'EACCES' || error.code === 'EPERM')) {
        throw new PermissionError(filePath);
      }

      // Other read errors
      throw new ReadError(filePath, error);
    }

    throw error;
  }
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
