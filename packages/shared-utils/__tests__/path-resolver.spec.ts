import { describe, expect, it } from 'vitest';
import { normalizePath, resolvePath } from '../src/path-resolver.js';

describe('Path Resolver', () => {
  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizePath('C:\\project\\src\\file.css')).toBe('C:/project/src/file.css');
      expect(normalizePath('path\\to\\file.ts')).toBe('path/to/file.ts');
    });

    it('should resolve . and .. segments', () => {
      expect(normalizePath('/project/src/./file.css')).toBe('/project/src/file.css');
      expect(normalizePath('/project/src/../dist/file.css')).toBe('/project/dist/file.css');
      expect(normalizePath('./src/./file.css')).toBe('src/file.css');
    });

    it('should collapse multiple consecutive slashes', () => {
      expect(normalizePath('/project//src///file.css')).toBe('/project/src/file.css');
      expect(normalizePath('path///to/////file.ts')).toBe('path/to/file.ts');
    });

    it('should remove trailing slashes (except root)', () => {
      expect(normalizePath('/project/src/')).toBe('/project/src');
      expect(normalizePath('path/to/dir/')).toBe('path/to/dir');
      expect(normalizePath('/')).toBe('/');
    });

    it('should handle relative paths', () => {
      expect(normalizePath('./file.css')).toBe('file.css');
      expect(normalizePath('../file.css')).toBe('../file.css');
      expect(normalizePath('../../file.css')).toBe('../../file.css');
    });

    it('should handle already normalized paths', () => {
      expect(normalizePath('/project/src/file.css')).toBe('/project/src/file.css');
      expect(normalizePath('path/to/file.ts')).toBe('path/to/file.ts');
    });
  });

  describe('resolvePath', () => {
    it('should resolve relative path to absolute path', () => {
      const result = resolvePath('./file.css', '/project/src');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src/file.css');
      }
    });

    it('should allow parent directory references', () => {
      const result = resolvePath('../shared/utils.ts', '/project/src/components');

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/project/src/shared/utils.ts');
    });

    it('should resolve nested relative paths', () => {
      const result = resolvePath('./components/button/index.tsx', '/project/src');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src/components/button/index.tsx');
      }
    });

    it('should normalize path separators in result', () => {
      // Even if input has backslashes, output should use forward slashes
      const result = resolvePath('.\\file.css', '/project/src');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toContain('/');
        expect(result.absolutePath).not.toContain('\\');
      }
    });

    it('should allow path traversal to parent directories', () => {
      const result = resolvePath('../../../etc/passwd', '/project/src');

      expect(result.success).toBe(true);
      // Path resolves to /etc/passwd (3 levels up from /project/src)
      expect(result.absolutePath).toBe('/etc/passwd');
    });

    it('should allow path traversal in different scenarios', () => {
      // Multiple levels up
      const result1 = resolvePath('../../../../outside.txt', '/project/src/components/button');
      expect(result1.success).toBe(true);
      expect(result1.absolutePath).toBe('/outside.txt');

      // Multiple levels up with path resolution
      const result2 = resolvePath('../../../templates/header.html', '/project/a/b');
      expect(result2.success).toBe(true);
      expect(result2.absolutePath).toBe('/templates/header.html');
    });

    it('should allow single-level parent directory navigation', () => {
      const result = resolvePath('../utils/helper.ts', '/project/src/components');

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/project/src/utils/helper.ts');
    });

    it('should handle empty relative path', () => {
      const result = resolvePath('', '/project/src');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src');
      }
    });

    it('should handle current directory reference', () => {
      const result = resolvePath('.', '/project/src');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src');
      }
    });

    it('should handle complex nested paths (within baseDir)', () => {
      const result = resolvePath('./a/./b/../c/d.ts', '/project/src');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toBe('/project/src/a/c/d.ts');
      }
    });
  });

  describe('Path Resolution Rules Enforcement', () => {
    it('RULE 1: Paths are resolved relative to baseDir (eligian file directory)', () => {
      // This test verifies that baseDir is the ONLY valid base for resolution
      const baseDir = '/project/src/pages';
      const result = resolvePath('./component.tsx', baseDir);

      expect(result.success).toBe(true);
      // Result should be relative to baseDir, NOT process.cwd() or any other directory
      expect(result.absolutePath).toBe('/project/src/pages/component.tsx');
    });

    it('RULE 2: Unix-style paths are maintained in output', () => {
      // Output should ALWAYS use forward slashes
      const result = resolvePath('./file.css', '/project/src');

      expect(result.success).toBe(true);
      expect(result.absolutePath).toContain('/');
      expect(result.absolutePath).not.toContain('\\');
    });

    it('RULE 3: Parent directory navigation is ALLOWED', () => {
      // Parent directory navigation using ../ is now permitted
      const result = resolvePath('../../../etc/passwd', '/project/src');

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/etc/passwd');
    });

    it('RULE 4: All relative paths are LEGAL (same dir, subdirectory, or parent)', () => {
      // Same directory - LEGAL
      const result1 = resolvePath('./file.css', '/project/src');
      expect(result1.success).toBe(true);
      expect(result1.absolutePath).toBe('/project/src/file.css');

      // Subdirectory - LEGAL
      const result2 = resolvePath('./components/button.tsx', '/project/src');
      expect(result2.success).toBe(true);
      expect(result2.absolutePath).toBe('/project/src/components/button.tsx');

      // Parent directory - LEGAL (now allowed)
      const result3 = resolvePath('../outside.html', '/project/src');
      expect(result3.success).toBe(true);
      expect(result3.absolutePath).toBe('/project/outside.html');

      // Multiple parent levels - LEGAL
      const result4 = resolvePath('../../shared/styles.css', '/project/src/features');
      expect(result4.success).toBe(true);
      expect(result4.absolutePath).toBe('/project/shared/styles.css');
    });
  });

  describe('Parent Directory Navigation (Feature 042)', () => {
    it('should resolve single parent directory reference', () => {
      const result = resolvePath('../shared/file.css', '/project/src');

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/project/shared/file.css');
    });

    it('should resolve multiple parent directory references', () => {
      const result = resolvePath('../../templates/header.html', '/project/src/features');

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/project/templates/header.html');
    });

    it('should resolve complex normalized paths', () => {
      const result = resolvePath('../../shared/../common/styles.css', '/project/src/features');

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/project/common/styles.css');
    });

    it('should resolve circular path segments', () => {
      const result = resolvePath('./foo/../bar/../foo/styles.css', '/project/src');

      expect(result.success).toBe(true);
      expect(result.absolutePath).toBe('/project/src/foo/styles.css');
    });

    it('should handle excessive parent navigation (more ../ than directory depth)', () => {
      // When navigating beyond root, the path normalizes to root-relative
      const result = resolvePath('../../../../../etc/file.txt', '/project/src');

      expect(result.success).toBe(true);
      // The path is normalized - excessive ../ is collapsed
      expect(result.absolutePath).toBe('/etc/file.txt');
    });
  });
});
