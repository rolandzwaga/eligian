import { describe, expect, it } from 'vitest';
import { normalizePath, resolvePath, validatePathSecurity } from '../src/path-resolver.js';

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

  describe('validatePathSecurity', () => {
    it('should allow paths within baseDir', () => {
      const result = validatePathSecurity('/project/src/file.css', '/project/src');

      expect(result.valid).toBe(true);
    });

    it('should allow path equal to baseDir', () => {
      const result = validatePathSecurity('/project/src', '/project/src');

      expect(result.valid).toBe(true);
    });

    it('should allow nested paths within baseDir', () => {
      const result = validatePathSecurity('/project/src/components/button.tsx', '/project/src');

      expect(result.valid).toBe(true);
    });

    it('should block paths outside baseDir', () => {
      const result = validatePathSecurity('/etc/passwd', '/project/src');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?._tag).toBe('SecurityError');
      expect(result.error?.path).toBe('/etc/passwd');
      expect(result.error?.projectRoot).toBe('/project/src');
    });

    it('should block paths that navigate outside baseDir', () => {
      const result = validatePathSecurity('/project/outside.html', '/project/src');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle trailing slashes correctly', () => {
      const result1 = validatePathSecurity('/project/src/file.css', '/project/src/');
      expect(result1.valid).toBe(true);

      const result2 = validatePathSecurity('/project/src/file.css', '/project/src');
      expect(result2.valid).toBe(true);
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

    it('should block parent directory references (navigates OUT OF baseDir)', () => {
      const result = resolvePath('../shared/utils.ts', '/project/src/components');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error._tag).toBe('SecurityError');
      }
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

    it('should block path traversal escaping baseDir', () => {
      const result = resolvePath('../../../etc/passwd', '/project/src');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error._tag).toBe('SecurityError');
        expect(result.error.message).toContain('Path traversal');
        expect(result.error.hint).toBeDefined();
      }
    });

    it('should block path traversal in different scenarios', () => {
      // Multiple levels up
      const result1 = resolvePath('../../../../outside.txt', '/project/src/components/button');
      expect(result1.success).toBe(false);

      // Single level that escapes
      const result2 = resolvePath('../../../etc/shadow', '/project/a/b');
      expect(result2.success).toBe(false);
    });

    it('should block single-level parent directory navigation', () => {
      // Even single ../ is blocked (navigates OUT OF baseDir)
      const result = resolvePath('../utils/helper.ts', '/project/src/components');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error._tag).toBe('SecurityError');
      }
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
      if (result.success) {
        // Result should be relative to baseDir, NOT process.cwd() or any other directory
        expect(result.absolutePath).toBe('/project/src/pages/component.tsx');
      }
    });

    it('RULE 2: Unix-style paths are maintained in output', () => {
      // Output should ALWAYS use forward slashes
      const result = resolvePath('./file.css', '/project/src');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.absolutePath).toContain('/');
        expect(result.absolutePath).not.toContain('\\');
      }
    });

    it('RULE 3: Paths navigating OUT OF baseDir are ILLEGAL', () => {
      // Security validation MUST block navigation outside the .eligian file's directory
      const result = resolvePath('../../../etc/passwd', '/project/src');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error._tag).toBe('SecurityError');
      }
    });

    it('RULE 4: Only same-directory and subdirectory paths are LEGAL', () => {
      // Same directory - LEGAL
      const result1 = resolvePath('./file.css', '/project/src');
      expect(result1.success).toBe(true);

      // Subdirectory - LEGAL
      const result2 = resolvePath('./components/button.tsx', '/project/src');
      expect(result2.success).toBe(true);

      // Parent directory - ILLEGAL (navigates OUT OF baseDir)
      const result3 = resolvePath('../outside.html', '/project/src');
      expect(result3.success).toBe(false);
    });
  });
});
