/**
 * Mock vscode module for testing
 */

export class Uri {
  scheme: string;
  path: string;

  constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.path = path;
  }

  static parse(uri: string): Uri {
    // Parse vscode-webview://authority/path/to/file
    const match = uri.match(/^([^:]+):\/\/([^/]+)(.*)$/);
    if (match) {
      const [, scheme, , path] = match;
      return new Uri(scheme, path || '/');
    }
    // Fallback: simple parsing
    const parts = uri.split('://');
    const scheme = parts[0] || '';
    const path = parts[1]?.replace(/^[^/]+/, '') || '/';
    return new Uri(scheme, path);
  }

  static file(path: string): Uri {
    return new Uri('file', path);
  }
}
