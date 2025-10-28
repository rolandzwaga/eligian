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
      toString: () => 'file:///workspace/styles/image.png',
    };

    const webviewUri = converter.convertToWebviewUri(fileUri);

    expect(webviewUri.scheme).toBe('vscode-webview');
    expect(webviewUri.path).toContain('image.png');
    expect(webviewUri.toString()).toContain('vscode-webview://');
  });

  it('should preserve path integrity during conversion', () => {
    const mockWebview = new MockWebview();
    const converter = new VSCodeWebviewUriConverter(mockWebview as any);

    const fileUri: Uri = {
      scheme: 'file',
      path: '/workspace/styles/subfolder/image.png',
      toString: () => 'file:///workspace/styles/subfolder/image.png',
    };

    const webviewUri = converter.convertToWebviewUri(fileUri);

    // Path should contain all components
    expect(webviewUri.path).toContain('workspace');
    expect(webviewUri.path).toContain('styles');
    expect(webviewUri.path).toContain('subfolder');
    expect(webviewUri.path).toContain('image.png');
  });

  it('should be deterministic (same input -> same output)', () => {
    const mockWebview = new MockWebview();
    const converter = new VSCodeWebviewUriConverter(mockWebview as any);

    const fileUri: Uri = {
      scheme: 'file',
      path: '/workspace/image.png',
      toString: () => 'file:///workspace/image.png',
    };

    const webviewUri1 = converter.convertToWebviewUri(fileUri);
    const webviewUri2 = converter.convertToWebviewUri(fileUri);

    expect(webviewUri1.toString()).toBe(webviewUri2.toString());
  });
});
