/**
 * CSS Loader Utilities
 *
 * Thin wrappers around @eligian/language CSS service for VS Code extension integration.
 * Most functionality delegated to language package (Feature 017 - Phase 2).
 */

// Import from language package (Feature 017)
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  generateCSSId as generateCSSIdInternal,
  loadCSS as loadCSSInternal,
  parseCSS,
  rewriteUrls as rewriteUrlsInternal,
} from '@eligian/language';
import type { IEngineConfiguration } from 'eligius';
import type * as vscode from 'vscode';
import { VSCodeWebviewUriConverter } from './webview-uri-converter.js';
/**
 * Re-export error types from language package for backwards compatibility
 */

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
export function extractCSSFiles(config: IEngineConfiguration): string[] {
  return config.cssFiles || [];
}

/**
 * Map every stylesheet pulled in through `@import` (transitively) by one of `cssFiles` to
 * the files of `cssFiles` that import it. The preview watches the imported sheets too and,
 * when one changes, reloads its importers (the webview loads the import through them).
 *
 * Keys are absolute paths as `path.resolve` gives them; unreadable files are skipped.
 *
 * @param cssFiles - Absolute paths of the CSS files injected into the preview
 * @param readFile - File reader (defaults to UTF-8 `readFileSync`)
 */
export function collectCSSImporters(
  cssFiles: readonly string[],
  readFile: (absolutePath: string) => string = file => readFileSync(file, 'utf-8')
): Map<string, Set<string>> {
  const importers = new Map<string, Set<string>>();
  for (const cssFile of cssFiles) {
    let content: string;
    try {
      content = readFile(cssFile);
    } catch {
      continue;
    }
    for (const imported of parseCSS(content, cssFile, { readFile }).importedFiles ?? []) {
      const key = path.resolve(imported);
      let set = importers.get(key);
      if (!set) {
        set = new Set();
        importers.set(key, set);
      }
      set.add(cssFile);
    }
  }
  return importers;
}
