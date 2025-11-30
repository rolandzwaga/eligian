/**
 * Cross-platform path handling integration tests
 *
 * Verifies that path resolution works identically on Windows, macOS, and Linux.
 * Uses Unix-style paths in `.eligian` files regardless of OS.
 */

import { describe, expect, it } from 'vitest';
import { normalizePath, resolvePath } from '../../src/path-resolver.js';

describe('Cross-Platform Path Handling', () => {
  describe('Path Normalization', () => {
    it('should convert Windows backslashes to forward slashes', () => {
      // Windows-style paths should be normalized to Unix-style
      expect(normalizePath('C:\\Users\\project\\src\\file.css')).toBe(
        'C:/Users/project/src/file.css'
      );
      expect(normalizePath('..\\..\\outside\\file.txt')).toBe('../../outside/file.txt');
      expect(normalizePath('components\\button\\index.tsx')).toBe('components/button/index.tsx');
    });

    it('should preserve Unix forward slashes and normalize relative paths', () => {
      // Absolute Unix-style paths should pass through unchanged
      expect(normalizePath('/home/user/project/src/file.css')).toBe(
        '/home/user/project/src/file.css'
      );
      // Relative paths with ./ should have ./ collapsed (expected normalization)
      expect(normalizePath('./components/button/index.tsx')).toBe('components/button/index.tsx');
      expect(normalizePath('../../outside/file.txt')).toBe('../../outside/file.txt');
    });

    it('should handle mixed separators (normalize to forward slashes)', () => {
      // Mixed separators should all become forward slashes
      expect(normalizePath('C:\\Users/project\\src/file.css')).toBe(
        'C:/Users/project/src/file.css'
      );
      // Relative path with mixed separators - ./ gets collapsed
      expect(normalizePath('./components\\button/index.tsx')).toBe('components/button/index.tsx');
    });

    it('should collapse . and .. segments correctly', () => {
      expect(normalizePath('/project/src/./file.css')).toBe('/project/src/file.css');
      expect(normalizePath('/project/src/../lib/util.ts')).toBe('/project/lib/util.ts');
      expect(normalizePath('/project/./src/../lib/./util.ts')).toBe('/project/lib/util.ts');
    });

    it('should remove trailing slashes (except root)', () => {
      expect(normalizePath('/project/src/')).toBe('/project/src');
      expect(normalizePath('/project/src/file.css/')).toBe('/project/src/file.css');
      expect(normalizePath('/')).toBe('/'); // Root should keep trailing slash
    });

    it('should collapse multiple consecutive slashes', () => {
      expect(normalizePath('/project//src///file.css')).toBe('/project/src/file.css');
      expect(normalizePath('C:\\\\Users\\\\project\\\\file.css')).toBe('C:/Users/project/file.css');
    });
  });

  describe('Path Resolution - Cross-Platform Behavior', () => {
    it('should resolve relative paths identically on all platforms', () => {
      // Same relative path, same baseDir → same result
      const baseDir = '/project/src';
      const relativePath = './components/button.tsx';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src/components/button.tsx');
      }
    });

    it('should resolve nested relative paths identically', () => {
      const baseDir = '/project/src';
      const relativePath = './components/forms/input/index.tsx';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src/components/forms/input/index.tsx');
      }
    });

    it('should allow parent directory navigation identically on all platforms', () => {
      // Parent directory navigation is now ALLOWED on ALL platforms
      const baseDir = '/project/src';
      const relativePath = '../outside/file.txt';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/project/outside/file.txt');
    });

    it('should handle Windows drive letters in baseDir (normalized)', () => {
      // Windows absolute path as baseDir
      const baseDir = 'F:/projects/eligian/examples';
      const relativePath = './demo.eligian';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('F:/projects/eligian/examples/demo.eligian');
        expect(result.absolutePath).toContain('/'); // Unix-style separators
        expect(result.absolutePath).not.toContain('\\'); // No backslashes
      }
    });

    it('should handle Unix absolute paths in baseDir', () => {
      // Unix absolute path as baseDir
      const baseDir = '/home/user/projects/eligian/examples';
      const relativePath = './demo.eligian';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/home/user/projects/eligian/examples/demo.eligian');
        expect(result.absolutePath).toContain('/'); // Unix-style separators
      }
    });

    it('should normalize Windows-style baseDir to Unix-style', () => {
      // Windows path with backslashes should be normalized
      const baseDir = 'F:\\projects\\eligian\\examples'; // Windows input
      const relativePath = './demo.eligian';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        // Output should be Unix-style
        expect(result.absolutePath).toBe('F:/projects/eligian/examples/demo.eligian');
        expect(result.absolutePath).not.toContain('\\'); // No backslashes in output
      }
    });

    it('should handle Windows-style relative paths (normalize to Unix)', () => {
      // Relative path with backslashes (Windows input style)
      const baseDir = '/project/src';
      const relativePath = '.\\components\\button.tsx'; // Windows-style input

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        // Output should be Unix-style
        expect(result.absolutePath).toBe('/project/src/components/button.tsx');
        expect(result.absolutePath).not.toContain('\\'); // No backslashes
      }
    });
  });

  describe('Parent Directory Navigation - Cross-Platform', () => {
    it('should allow path traversal with Unix-style separators', () => {
      const baseDir = '/project/src';
      const relativePath = '../../../etc/passwd'; // Unix-style

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/etc/passwd');
    });

    it('should allow path traversal with Windows-style separators', () => {
      const baseDir = '/project/src';
      const relativePath = '..\\..\\..\\Windows\\System32\\config'; // Windows-style

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      // Path is normalized to Unix-style
      expect(result.absolutePath).toBe('/Windows/System32/config');
    });

    it('should allow path traversal with mixed separators', () => {
      const baseDir = '/project/src';
      const relativePath = '../../outside\\sensitive/data.txt'; // Mixed

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/outside/sensitive/data.txt');
    });

    it('should allow same-directory paths on all platforms', () => {
      const baseDir = '/project/src';

      // Unix-style
      const result1 = resolvePath('./file.css', baseDir);
      expect(result1.success).toBe(true);

      // Windows-style (normalized)
      const result2 = resolvePath('.\\file.css', baseDir);
      expect(result2.success).toBe(true);

      // Both should resolve to same path
      if (result1.success && result2.success) {
        expect(result1.absolutePath).toBe(result2.absolutePath);
      }
    });

    it('should allow subdirectory paths on all platforms', () => {
      const baseDir = '/project/src';

      // Unix-style
      const result1 = resolvePath('./components/button.tsx', baseDir);
      expect(result1.success).toBe(true);

      // Windows-style (normalized)
      const result2 = resolvePath('.\\components\\button.tsx', baseDir);
      expect(result2.success).toBe(true);

      // Both should resolve to same path
      if (result1.success && result2.success) {
        expect(result1.absolutePath).toBe(result2.absolutePath);
      }
    });
  });

  describe('Edge Cases - Cross-Platform', () => {
    it('should handle empty relative path on all platforms', () => {
      const baseDir = '/project/src';
      const result = resolvePath('', baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src');
      }
    });

    it('should handle current directory reference (.) on all platforms', () => {
      const baseDir = '/project/src';
      const result = resolvePath('.', baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src');
      }
    });

    it('should preserve Unicode characters in paths', () => {
      const baseDir = '/project/src';
      const relativePath = './文字化け/ファイル.css';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src/文字化け/ファイル.css');
      }
    });

    it('should handle paths with spaces on all platforms', () => {
      const baseDir = '/project/My Project/src';
      const relativePath = './My Components/My Button.tsx';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/My Project/src/My Components/My Button.tsx');
      }
    });

    it('should handle paths with special characters', () => {
      const baseDir = '/project/src';
      const relativePath = './components/button-v2.0_final[1].tsx';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src/components/button-v2.0_final[1].tsx');
      }
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle Windows project path with Unix-style imports', () => {
      // Windows project: F:\projects\eligian\examples\demo.eligian
      // Import: ./styles/main.css
      const baseDir = 'F:/projects/eligian/examples';
      const relativePath = './styles/main.css';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('F:/projects/eligian/examples/styles/main.css');
        expect(result.absolutePath).not.toContain('\\');
      }
    });

    it('should handle macOS project path with Unix-style imports', () => {
      // macOS project: /Users/developer/projects/eligian/examples/demo.eligian
      // Import: ./styles/main.css
      const baseDir = '/Users/developer/projects/eligian/examples';
      const relativePath = './styles/main.css';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe(
          '/Users/developer/projects/eligian/examples/styles/main.css'
        );
      }
    });

    it('should handle Linux project path with Unix-style imports', () => {
      // Linux project: /home/developer/projects/eligian/examples/demo.eligian
      // Import: ./styles/main.css
      const baseDir = '/home/developer/projects/eligian/examples';
      const relativePath = './styles/main.css';

      const result = resolvePath(relativePath, baseDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe(
          '/home/developer/projects/eligian/examples/styles/main.css'
        );
      }
    });

    it('should produce identical results for same logical path on different OSes', () => {
      // Same relative import on different OS project structures
      const relativePath = './components/header/index.tsx';

      // Windows
      const resultWindows = resolvePath(relativePath, 'F:/projects/myapp/src');
      // macOS
      const resultMacOS = resolvePath(relativePath, '/Users/dev/projects/myapp/src');
      // Linux
      const resultLinux = resolvePath(relativePath, '/home/dev/projects/myapp/src');

      // All should succeed
      expect(resultWindows.success).toBe(true);
      expect(resultMacOS.success).toBe(true);
      expect(resultLinux.success).toBe(true);

      // All should use Unix-style separators
      if (resultWindows.success) {
        expect(resultWindows.absolutePath).toContain('/');
        expect(resultWindows.absolutePath).not.toContain('\\');
      }
      if (resultMacOS.success) {
        expect(resultMacOS.absolutePath).toContain('/');
      }
      if (resultLinux.success) {
        expect(resultLinux.absolutePath).toContain('/');
      }
    });
  });
});
