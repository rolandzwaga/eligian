/**
 * Webview CSS Injector
 *
 * Handles CSS injection and hot-reload in VS Code webview for Eligian preview.
 */

import * as path from 'node:path';
import { loadCSS } from '@eligian/language';
import * as vscode from 'vscode';
import { generateCSSId } from './css-loader.js';
import { createRecordingWebview } from './preview/resource-roots.js';
import { VSCodeWebviewUriConverter } from './webview-uri-converter.js';

/**
 * Error tracking for rate-limiting notifications
 */
interface ErrorInfo {
  filePath: string;
  lastNotification: number;
  count: number;
}

/**
 * Read a CSS file and rewrite its url() references to webview URIs.
 *
 * Rewrites in a single pass with the webview converter. (`loadCSSFile` from
 * css-loader already rewrites with a pass-through converter, turning every
 * url() into a `file://` URL that a second `rewriteCSSUrls` pass then skips
 * because it has a scheme, so url() assets never got webview URIs.)
 *
 * @throws Error if the file cannot be read
 */
async function loadRewrittenCSS(absolutePath: string, webview: vscode.Webview): Promise<string> {
  const loaded = await loadCSS(absolutePath, new VSCodeWebviewUriConverter(webview));
  return loaded.content;
}

/**
 * One CSS file loaded and rewritten by {@link WebviewCSSInjector.prepareCSS}.
 */
export interface PreparedCSSFile {
  readonly cssId: string;
  /** Path as given by the caller (used for display) */
  readonly cssFile: string;
  readonly absolutePath: string;
  readonly loadOrder: number;
  /** Rewritten CSS; undefined when loading failed */
  readonly content?: string;
  readonly error?: unknown;
}

/**
 * A CSS set ready to be posted to the webview.
 */
export interface PreparedCSS {
  readonly files: readonly PreparedCSSFile[];
  /** CSS files plus every local file their url() references resolve to */
  readonly referencedLocalPaths: readonly string[];
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
   * Additive: CSS injected earlier and absent from `cssFiles` stays injected.
   * Use {@link prepareCSS} + {@link applyCSS} to replace the whole set.
   *
   * @param cssFiles - Array of CSS file paths (relative to workspace or absolute)
   */
  async injectCSS(cssFiles: string[]): Promise<void> {
    await this.postPrepared(await this.prepareCSS(cssFiles));
  }

  /**
   * Load and rewrite CSS files without posting anything to the webview.
   *
   * Lets the caller inspect {@link PreparedCSS.referencedLocalPaths} (the CSS
   * files and their `url()` assets), for example to extend the webview's
   * `localResourceRoots`, before calling {@link applyCSS}.
   *
   * @param cssFiles - CSS file paths (relative to workspace or absolute)
   */
  async prepareCSS(cssFiles: readonly string[]): Promise<PreparedCSS> {
    const referenced = new Set<string>();
    const recordingWebview = createRecordingWebview(this.webview, fsPath => referenced.add(fsPath));
    const files: PreparedCSSFile[] = [];

    for (let i = 0; i < cssFiles.length; i++) {
      const cssFile = cssFiles[i];
      const absolutePath = path.isAbsolute(cssFile)
        ? cssFile
        : path.resolve(this.workspaceRoot, cssFile);
      const cssId = generateCSSId(absolutePath);
      referenced.add(absolutePath);

      try {
        // Load CSS file content and rewrite url() paths to webview URIs
        const content = await loadRewrittenCSS(absolutePath, recordingWebview);
        files.push({ cssId, cssFile, absolutePath, loadOrder: i, content });
      } catch (error) {
        files.push({ cssId, cssFile, absolutePath, loadOrder: i, error });
      }
    }

    return { files, referencedLocalPaths: [...referenced] };
  }

  /**
   * Make the webview's injected CSS exactly the prepared set.
   *
   * Removes every previously injected stylesheet that is not part of
   * `prepared` (e.g. a `styles` import deleted from the .eligian source), then
   * loads the prepared files in order. A prepared file that failed to load keeps
   * its previous stylesheet (if any) and reports the error.
   *
   * @param prepared - Result of {@link prepareCSS}
   */
  async applyCSS(prepared: PreparedCSS): Promise<void> {
    const keep = new Set(prepared.files.map(file => file.cssId));
    for (const [cssId, filePath] of [...this.loadedCSS]) {
      if (!keep.has(cssId)) {
        await this.removeCSS(filePath);
      }
    }
    await this.postPrepared(prepared);
  }

  /**
   * Absolute paths of the CSS files currently injected into the webview.
   */
  getLoadedFiles(): string[] {
    return [...this.loadedCSS.values()];
  }

  /**
   * Post css-load (or css-error) messages for prepared files, in order.
   */
  private async postPrepared(prepared: PreparedCSS): Promise<void> {
    for (const file of prepared.files) {
      if (file.content === undefined) {
        // Handle CSS loading error - continue with other files
        await this.handleCSSError(file.cssId, file.cssFile, file.absolutePath, file.error);
        continue;
      }

      try {
        await this.webview.postMessage({
          type: 'css-load',
          payload: {
            cssId: file.cssId,
            content: file.content,
            sourceFile: file.cssFile,
            loadOrder: file.loadOrder,
          },
        });

        // Track loaded CSS
        this.loadedCSS.set(file.cssId, file.absolutePath);
      } catch (error) {
        await this.handleCSSError(file.cssId, file.cssFile, file.absolutePath, error);
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
      // Load updated CSS content with url() paths rewritten to webview URIs
      const rewrittenCSS = await loadRewrittenCSS(cssFile, this.webview);

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
  async removeCSS(cssFile: string): Promise<void> {
    const cssId = generateCSSId(cssFile);
    this.loadedCSS.delete(cssId);
    this.errorTracking.delete(cssId);

    const message = {
      type: 'css-remove',
      payload: {
        cssId,
      },
    };

    await this.webview.postMessage(message);
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
