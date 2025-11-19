/**
 * VSCodeWebviewUriConverter Tests
 */

import type { Uri } from '@eligian/language';
import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { VSCodeWebviewUriConverter } from '../webview-uri-converter.js';

/**
 * Mock Webview for testing
 *
 * Simulates VS Code's webview.asWebviewUri() behavior for testing.
 */
class MockWebview {
  asWebviewUri(uri: vscode.Uri): vscode.Uri {
    // Simulate VS Code's webview URI conversion
    // file:///path -> vscode-webview://authority/path
    return vscode.Uri.parse(`vscode-webview://authority${uri.path}`);
  }
}

describe('VSCodeWebviewUriConverter', () => {
  it('should convert file URIs to webview URIs', () => {
    const mockWebview = new MockWebview();
    const converter = new VSCodeWebviewUriConverter(mockWebview as any);

    const fileUri: Uri = {
      scheme: 'file',
      path: '/workspace/styles/image.png',
      fragment: '',
      query: '',
    };

    const webviewUri = converter.convertToWebviewUri(fileUri);

    expect(webviewUri.scheme).toBe('vscode-webview');
    expect(webviewUri.path).toBe('/workspace/styles/image.png');
  });

  it('should preserve path separators', () => {
    const mockWebview = new MockWebview();
    const converter = new VSCodeWebviewUriConverter(mockWebview as any);

    const fileUri: Uri = {
      scheme: 'file',
      path: '/workspace/styles/nested/deep/image.png',
      fragment: '',
      query: '',
    };

    const webviewUri = converter.convertToWebviewUri(fileUri);

    expect(webviewUri.path).toBe('/workspace/styles/nested/deep/image.png');
  });
});
