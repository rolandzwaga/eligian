/**
 * Mock vscode module for testing
 */

export class Uri {
  scheme: string;
  path: string;
  fsPath: string;

  constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.path = path;
    // Convert URI path to file system path
    this.fsPath = path.replace('file:///', '').replace(/%3A/g, ':');
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
    const uri = new Uri('file', path);
    uri.fsPath = path;
    return uri;
  }

  toString(): string {
    return `${this.scheme}:///${this.path.replace(/\\/g, '/').replace(/:/g, '%3A')}`;
  }
}

export class RelativePattern {
  base: string;
  pattern: string;

  constructor(base: string, pattern: string) {
    this.base = base;
    this.pattern = pattern;
  }
}

export const workspace = {
  getWorkspaceFolder: () => ({
    uri: { fsPath: 'F:\\workspace' },
  }),
  createFileSystemWatcher: () => ({
    onDidCreate: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
};
