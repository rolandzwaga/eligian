/**
 * VSCode Webview URI Converter Adapter
 *
 * Adapts VS Code's webview.asWebviewUri() to the platform-agnostic WebviewUriConverter interface
 * used by the language package CSS service.
 *
 * This adapter allows the language package to remain free of VS Code dependencies while
 * still supporting VS Code-specific webview URI conversion.
 */

import type { Uri, WebviewUriConverter } from '@eligian/language';
import * as vscode from 'vscode';

/**
 * VS Code implementation of WebviewUriConverter
 *
 * Wraps VS Code's Webview instance to provide platform-agnostic URI conversion.
 *
 * @example
 * ```typescript
 * const converter = new VSCodeWebviewUriConverter(panel.webview);
 * const webviewUri = converter.convertToWebviewUri({
 *   scheme: 'file',
 *   path: '/workspace/image.png',
 *   toString: () => 'file:///workspace/image.png'
 * });
 * console.log(webviewUri.toString()); // 'vscode-webview://authority/workspace/image.png'
 * ```
 */
export class VSCodeWebviewUriConverter implements WebviewUriConverter {
  constructor(private readonly webview: vscode.Webview) {}

  convertToWebviewUri(fileUri: Uri): Uri {
    // Convert platform-agnostic Uri to VS Code Uri
    const vscodeUri = vscode.Uri.file(fileUri.path);

    // Use VS Code's webview URI conversion
    const webviewUri = this.webview.asWebviewUri(vscodeUri);

    // Convert back to platform-agnostic Uri
    return {
      scheme: webviewUri.scheme,
      path: webviewUri.path,
      toString: () => webviewUri.toString(),
    };
  }
}
