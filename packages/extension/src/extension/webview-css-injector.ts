/**
 * Webview CSS Injector
 *
 * Handles CSS injection and hot-reload in VS Code webview for Eligian preview.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import { generateCSSId, loadCSSFile, rewriteCSSUrls } from './css-loader.js';

/**
 * Message types sent to webview for CSS operations
 */
export interface CSSLoadMessage {
  type: 'css-load';
  cssId: string;
  content: string;
  sourceFile: string;
  loadOrder: number;
}

export interface CSSReloadMessage {
  type: 'css-reload';
  cssId: string;
  content: string;
  sourceFile: string;
}

export interface CSSRemoveMessage {
  type: 'css-remove';
  cssId: string;
}

export interface CSSErrorMessage {
  type: 'css-error';
  cssId: string;
  filePath: string;
  error: string;
  code: 'NOT_FOUND' | 'READ_ERROR' | 'PERMISSION_DENIED';
}

export type CSSMessage = CSSLoadMessage | CSSReloadMessage | CSSRemoveMessage | CSSErrorMessage;

/**
 * Error tracking for rate-limiting notifications
 */
interface ErrorInfo {
  filePath: string;
  lastNotification: number;
  count: number;
}

/**
 * T009: WebviewCSSInjector class
 *
 * Manages CSS injection into webview for Eligian preview.
 * Handles initial loading, hot-reload, and error reporting.
 */
export class WebviewCSSInjector {
  private readonly webview: vscode.Webview;
  private readonly workspaceRoot: string;
  private readonly loadedCSS = new Map<string, string>(); // cssId -> file path
  private readonly errorTracking = new Map<string, ErrorInfo>(); // cssId -> error info
  private readonly RATE_LIMIT_MS = 60000; // 1 minute
  private readonly MAX_ERRORS_PER_MINUTE = 3;

  /**
   * Initialize CSS injector
   *
   * @param webview - VS Code webview instance
   * @param workspaceRoot - Absolute path to workspace root
   */
  constructor(webview: vscode.Webview, workspaceRoot: string) {
    this.webview = webview;
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * T010: Initial CSS load when preview opens
   *
   * Loads all CSS files, rewrites URLs, and sends messages to webview in order.
   *
   * @param cssFiles - Array of CSS file paths (relative to workspace or absolute)
   */
  async injectCSS(cssFiles: string[]): Promise<void> {
    for (let i = 0; i < cssFiles.length; i++) {
      const cssFile = cssFiles[i];
      const absolutePath = path.isAbsolute(cssFile)
        ? cssFile
        : path.resolve(this.workspaceRoot, cssFile);

      const cssId = generateCSSId(absolutePath);

      try {
        // Load CSS file content
        const cssContent = await loadCSSFile(absolutePath);

        // Rewrite url() paths to webview URIs
        const rewrittenCSS = rewriteCSSUrls(cssContent, absolutePath, this.webview);

        // Send css-load message to webview
        const message = {
          type: 'css-load',
          payload: {
            cssId,
            content: rewrittenCSS,
            sourceFile: cssFile,
            loadOrder: i,
          },
        };

        await this.webview.postMessage(message);

        // Track loaded CSS
        this.loadedCSS.set(cssId, absolutePath);
      } catch (error) {
        // Handle CSS loading error - continue with other files
        await this.handleCSSError(cssId, cssFile, absolutePath, error);
      }
    }
  }

  /**
   * T020: Hot-reload single CSS file after change
   *
   * @param cssFile - Absolute path to changed CSS file
   */
  async reloadCSS(cssFile: string): Promise<void> {
    const cssId = generateCSSId(cssFile);

    try {
      // Load updated CSS content
      const cssContent = await loadCSSFile(cssFile);

      // Rewrite url() paths
      const rewrittenCSS = rewriteCSSUrls(cssContent, cssFile, this.webview);

      // Send css-reload message to webview
      const message = {
        type: 'css-reload',
        payload: {
          cssId,
          content: rewrittenCSS,
          sourceFile: cssFile,
        },
      };

      await this.webview.postMessage(message);

      // Update tracked CSS
      this.loadedCSS.set(cssId, cssFile);

      // Clear error tracking if reload succeeded
      this.errorTracking.delete(cssId);
    } catch (error) {
      // Handle CSS loading error - keep previous CSS
      await this.handleCSSError(cssId, cssFile, cssFile, error);
    }
  }

  /**
   * Remove CSS from webview
   *
   * @param cssFile - Absolute path to removed CSS file
   */
  removeCSS(cssFile: string): void {
    const cssId = generateCSSId(cssFile);

    const message = {
      type: 'css-remove',
      payload: {
        cssId,
      },
    };

    this.webview.postMessage(message);
    this.loadedCSS.delete(cssId);
    this.errorTracking.delete(cssId);
  }

  /**
   * T024/T027/T028: Handle CSS loading error
   *
   * Sends error message to webview and shows notification with rate limiting.
   *
   * @private
   */
  private async handleCSSError(
    cssId: string,
    displayPath: string,
    absolutePath: string,
    error: unknown
  ): Promise<void> {
    let errorCode: 'NOT_FOUND' | 'READ_ERROR' | 'PERMISSION_DENIED' = 'READ_ERROR';
    let errorMessage = 'Unknown error';

    if (error instanceof Error) {
      errorMessage = error.message;

      // Determine error code based on error type
      if (error.name === 'FileNotFoundError') {
        errorCode = 'NOT_FOUND';
      } else if (error.name === 'PermissionError') {
        errorCode = 'PERMISSION_DENIED';
      }
    }

    // Send error message to webview
    const message = {
      type: 'css-error',
      payload: {
        cssId,
        filePath: displayPath,
        error: errorMessage,
        code: errorCode,
      },
    };

    await this.webview.postMessage(message);

    // Show error notification with rate limiting
    this.showCSSError(absolutePath, errorMessage);
  }

  /**
   * T024/T030: Display CSS error notification to user with rate limiting
   *
   * @param cssFile - CSS file path
   * @param error - Error message
   */
  showCSSError(cssFile: string, error: string): void {
    const cssId = generateCSSId(cssFile);
    const now = Date.now();

    // Check rate limiting
    const errorInfo = this.errorTracking.get(cssId);
    if (errorInfo) {
      const timeSinceLastNotification = now - errorInfo.lastNotification;

      // Within rate limit window
      if (timeSinceLastNotification < this.RATE_LIMIT_MS) {
        // Check if we've exceeded max errors
        if (errorInfo.count >= this.MAX_ERRORS_PER_MINUTE) {
          return; // Suppress notification
        }
        errorInfo.count++;
      } else {
        // Reset count after rate limit window
        errorInfo.count = 1;
        errorInfo.lastNotification = now;
      }
    } else {
      // First error for this file
      this.errorTracking.set(cssId, {
        filePath: cssFile,
        lastNotification: now,
        count: 1,
      });
    }

    // Show error notification
    vscode.window.showErrorMessage(`CSS Error: ${error}`, 'Open File').then(action => {
      if (action === 'Open File') {
        vscode.workspace.openTextDocument(cssFile).then(doc => {
          vscode.window.showTextDocument(doc);
        });
      }
    });
  }
}
