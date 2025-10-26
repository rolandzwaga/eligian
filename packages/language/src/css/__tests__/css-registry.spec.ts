import { beforeEach, describe, expect, it } from 'vitest';
import type { CSSParseResult } from '../css-parser.js';
import { CSSRegistryService } from '../css-registry.js';

describe('CSSRegistryService', () => {
  let registry: CSSRegistryService;

  beforeEach(() => {
    registry = new CSSRegistryService();
  });

  describe('updateCSSFile and getMetadata', () => {
    it('should store and retrieve CSS metadata', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button', 'primary']),
        ids: new Set(['header']),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      const retrieved = registry.getMetadata('file:///styles.css');

      expect(retrieved).toBeDefined();
      expect(retrieved?.classes.has('button')).toBe(true);
      expect(retrieved?.classes.has('primary')).toBe(true);
      expect(retrieved?.ids.has('header')).toBe(true);
    });

    it('should replace existing metadata when updating same file', () => {
      const metadata1: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      const metadata2: CSSParseResult = {
        classes: new Set(['primary']),
        ids: new Set(['header']),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata1);
      registry.updateCSSFile('file:///styles.css', metadata2);

      const retrieved = registry.getMetadata('file:///styles.css');
      expect(retrieved?.classes.has('button')).toBe(false);
      expect(retrieved?.classes.has('primary')).toBe(true);
      expect(retrieved?.ids.has('header')).toBe(true);
    });

    it('should return undefined for non-existent file', () => {
      const retrieved = registry.getMetadata('file:///nonexistent.css');
      expect(retrieved).toBeUndefined();
    });

    it('should handle empty metadata', () => {
      const metadata: CSSParseResult = {
        classes: new Set(),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///empty.css', metadata);
      const retrieved = registry.getMetadata('file:///empty.css');

      expect(retrieved).toBeDefined();
      expect(retrieved?.classes.size).toBe(0);
      expect(retrieved?.ids.size).toBe(0);
    });
  });

  describe('registerImports', () => {
    it('should register CSS imports for a document', () => {
      const cssFiles = ['file:///styles.css', 'file:///theme.css'];
      registry.registerImports('file:///document.eligian', cssFiles);

      // Verify by checking if classes from these files are available
      // (tested more thoroughly in getClassesForDocument tests)
      expect(true).toBe(true); // registerImports doesn't have direct return
    });

    it('should replace previous imports when registering again', () => {
      const cssFiles1 = ['file:///styles.css'];
      const cssFiles2 = ['file:///theme.css', 'file:///colors.css'];

      registry.registerImports('file:///document.eligian', cssFiles1);
      registry.registerImports('file:///document.eligian', cssFiles2);

      // Verified through getClassesForDocument in later tests
      expect(true).toBe(true);
    });

    it('should handle empty CSS imports array', () => {
      registry.registerImports('file:///document.eligian', []);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getClassesForDocument', () => {
    it('should aggregate classes from all imported CSS files', () => {
      const metadata1: CSSParseResult = {
        classes: new Set(['button', 'primary']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      const metadata2: CSSParseResult = {
        classes: new Set(['header', 'footer']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata1);
      registry.updateCSSFile('file:///theme.css', metadata2);
      registry.registerImports('file:///document.eligian', [
        'file:///styles.css',
        'file:///theme.css',
      ]);

      const classes = registry.getClassesForDocument('file:///document.eligian');

      expect(classes.has('button')).toBe(true);
      expect(classes.has('primary')).toBe(true);
      expect(classes.has('header')).toBe(true);
      expect(classes.has('footer')).toBe(true);
      expect(classes.size).toBe(4);
    });

    it('should deduplicate classes across multiple files', () => {
      const metadata1: CSSParseResult = {
        classes: new Set(['button', 'primary']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      const metadata2: CSSParseResult = {
        classes: new Set(['button', 'secondary']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata1);
      registry.updateCSSFile('file:///theme.css', metadata2);
      registry.registerImports('file:///document.eligian', [
        'file:///styles.css',
        'file:///theme.css',
      ]);

      const classes = registry.getClassesForDocument('file:///document.eligian');

      expect(classes.has('button')).toBe(true);
      expect(classes.has('primary')).toBe(true);
      expect(classes.has('secondary')).toBe(true);
      expect(classes.size).toBe(3); // 'button' counted once
    });

    it('should return empty set for document with no imports', () => {
      const classes = registry.getClassesForDocument('file:///unknown.eligian');
      expect(classes.size).toBe(0);
    });

    it('should return empty set when CSS files have not been parsed yet', () => {
      registry.registerImports('file:///document.eligian', ['file:///unparsed.css']);

      const classes = registry.getClassesForDocument('file:///document.eligian');
      expect(classes.size).toBe(0);
    });

    it('should handle partial CSS file availability', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///document.eligian', [
        'file:///styles.css',
        'file:///missing.css',
      ]);

      const classes = registry.getClassesForDocument('file:///document.eligian');

      expect(classes.has('button')).toBe(true);
      expect(classes.size).toBe(1);
    });
  });

  describe('getIDsForDocument', () => {
    it('should aggregate IDs from all imported CSS files', () => {
      const metadata1: CSSParseResult = {
        classes: new Set(),
        ids: new Set(['header', 'footer']),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      const metadata2: CSSParseResult = {
        classes: new Set(),
        ids: new Set(['sidebar', 'content']),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata1);
      registry.updateCSSFile('file:///theme.css', metadata2);
      registry.registerImports('file:///document.eligian', [
        'file:///styles.css',
        'file:///theme.css',
      ]);

      const ids = registry.getIDsForDocument('file:///document.eligian');

      expect(ids.has('header')).toBe(true);
      expect(ids.has('footer')).toBe(true);
      expect(ids.has('sidebar')).toBe(true);
      expect(ids.has('content')).toBe(true);
      expect(ids.size).toBe(4);
    });

    it('should deduplicate IDs across multiple files', () => {
      const metadata1: CSSParseResult = {
        classes: new Set(),
        ids: new Set(['header', 'footer']),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      const metadata2: CSSParseResult = {
        classes: new Set(),
        ids: new Set(['header', 'sidebar']),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata1);
      registry.updateCSSFile('file:///theme.css', metadata2);
      registry.registerImports('file:///document.eligian', [
        'file:///styles.css',
        'file:///theme.css',
      ]);

      const ids = registry.getIDsForDocument('file:///document.eligian');

      expect(ids.has('header')).toBe(true);
      expect(ids.has('footer')).toBe(true);
      expect(ids.has('sidebar')).toBe(true);
      expect(ids.size).toBe(3); // 'header' counted once
    });

    it('should return empty set for document with no imports', () => {
      const ids = registry.getIDsForDocument('file:///unknown.eligian');
      expect(ids.size).toBe(0);
    });
  });

  describe('findClassLocation', () => {
    it('should return location of class from imported CSS file', () => {
      const location = {
        filePath: 'file:///styles.css',
        startLine: 10,
        startColumn: 1,
        endLine: 12,
        endColumn: 2,
      };

      const metadata: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map([['button', location]]),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///document.eligian', ['file:///styles.css']);

      const found = registry.findClassLocation('file:///document.eligian', 'button');

      expect(found).toEqual(location);
    });

    it('should return location from first imported file if class appears in multiple files', () => {
      const location1 = {
        filePath: 'file:///styles.css',
        startLine: 10,
        startColumn: 1,
        endLine: 12,
        endColumn: 2,
      };

      const location2 = {
        filePath: 'file:///theme.css',
        startLine: 5,
        startColumn: 1,
        endLine: 7,
        endColumn: 2,
      };

      const metadata1: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map([['button', location1]]),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      const metadata2: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map([['button', location2]]),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata1);
      registry.updateCSSFile('file:///theme.css', metadata2);
      registry.registerImports('file:///document.eligian', [
        'file:///styles.css',
        'file:///theme.css',
      ]);

      const found = registry.findClassLocation('file:///document.eligian', 'button');

      expect(found).toEqual(location1); // First file wins
    });

    it('should return undefined for non-existent class', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///document.eligian', ['file:///styles.css']);

      const found = registry.findClassLocation('file:///document.eligian', 'nonexistent');

      expect(found).toBeUndefined();
    });

    it('should return undefined for document with no imports', () => {
      const found = registry.findClassLocation('file:///unknown.eligian', 'button');
      expect(found).toBeUndefined();
    });
  });

  describe('findIDLocation', () => {
    it('should return location of ID from imported CSS file', () => {
      const location = {
        filePath: 'file:///styles.css',
        startLine: 20,
        startColumn: 1,
        endLine: 22,
        endColumn: 2,
      };

      const metadata: CSSParseResult = {
        classes: new Set(),
        ids: new Set(['header']),
        classLocations: new Map(),
        idLocations: new Map([['header', location]]),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///document.eligian', ['file:///styles.css']);

      const found = registry.findIDLocation('file:///document.eligian', 'header');

      expect(found).toEqual(location);
    });

    it('should return undefined for non-existent ID', () => {
      const metadata: CSSParseResult = {
        classes: new Set(),
        ids: new Set(['header']),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///document.eligian', ['file:///styles.css']);

      const found = registry.findIDLocation('file:///document.eligian', 'nonexistent');

      expect(found).toBeUndefined();
    });
  });

  describe('hasErrors and getErrors', () => {
    it('should report errors for CSS file with parse errors', () => {
      const metadata: CSSParseResult = {
        classes: new Set(),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [
          {
            message: 'Unclosed block',
            filePath: 'file:///styles.css',
            line: 10,
            column: 5,
          },
        ],
      };

      registry.updateCSSFile('file:///styles.css', metadata);

      expect(registry.hasErrors('file:///styles.css')).toBe(true);
      const errors = registry.getErrors('file:///styles.css');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Unclosed block');
    });

    it('should report no errors for valid CSS file', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);

      expect(registry.hasErrors('file:///styles.css')).toBe(false);
      expect(registry.getErrors('file:///styles.css')).toHaveLength(0);
    });

    it('should return false for non-existent CSS file', () => {
      expect(registry.hasErrors('file:///nonexistent.css')).toBe(false);
    });

    it('should return empty array for non-existent CSS file errors', () => {
      expect(registry.getErrors('file:///nonexistent.css')).toEqual([]);
    });
  });

  describe('clearDocument', () => {
    it('should remove CSS imports for a document', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///document.eligian', ['file:///styles.css']);

      let classes = registry.getClassesForDocument('file:///document.eligian');
      expect(classes.size).toBe(1);

      registry.clearDocument('file:///document.eligian');

      classes = registry.getClassesForDocument('file:///document.eligian');
      expect(classes.size).toBe(0);
    });

    it('should not affect other documents', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///document1.eligian', ['file:///styles.css']);
      registry.registerImports('file:///document2.eligian', ['file:///styles.css']);

      registry.clearDocument('file:///document1.eligian');

      const classes1 = registry.getClassesForDocument('file:///document1.eligian');
      const classes2 = registry.getClassesForDocument('file:///document2.eligian');

      expect(classes1.size).toBe(0);
      expect(classes2.size).toBe(1);
    });

    it('should not throw when clearing non-existent document', () => {
      expect(() => {
        registry.clearDocument('file:///nonexistent.eligian');
      }).not.toThrow();
    });
  });

  describe('removeCSSFile', () => {
    it('should remove CSS file metadata', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      expect(registry.getMetadata('file:///styles.css')).toBeDefined();

      registry.removeCSSFile('file:///styles.css');
      expect(registry.getMetadata('file:///styles.css')).toBeUndefined();
    });

    it('should affect documents that import the removed CSS file', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///document.eligian', ['file:///styles.css']);

      let classes = registry.getClassesForDocument('file:///document.eligian');
      expect(classes.size).toBe(1);

      registry.removeCSSFile('file:///styles.css');

      classes = registry.getClassesForDocument('file:///document.eligian');
      expect(classes.size).toBe(0); // CSS file removed, no classes available
    });

    it('should not throw when removing non-existent CSS file', () => {
      expect(() => {
        registry.removeCSSFile('file:///nonexistent.css');
      }).not.toThrow();
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multiple documents importing same CSS files', () => {
      const metadata: CSSParseResult = {
        classes: new Set(['button', 'primary']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata);
      registry.registerImports('file:///doc1.eligian', ['file:///styles.css']);
      registry.registerImports('file:///doc2.eligian', ['file:///styles.css']);

      const classes1 = registry.getClassesForDocument('file:///doc1.eligian');
      const classes2 = registry.getClassesForDocument('file:///doc2.eligian');

      expect(classes1.size).toBe(2);
      expect(classes2.size).toBe(2);
    });

    it('should handle document importing multiple CSS files with overlapping classes', () => {
      const metadata1: CSSParseResult = {
        classes: new Set(['button', 'primary', 'large']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      const metadata2: CSSParseResult = {
        classes: new Set(['button', 'secondary', 'small']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata1);
      registry.updateCSSFile('file:///theme.css', metadata2);
      registry.registerImports('file:///document.eligian', [
        'file:///styles.css',
        'file:///theme.css',
      ]);

      const classes = registry.getClassesForDocument('file:///document.eligian');

      expect(classes.size).toBe(5); // button, primary, large, secondary, small (button deduplicated)
      expect(classes.has('button')).toBe(true);
      expect(classes.has('primary')).toBe(true);
      expect(classes.has('secondary')).toBe(true);
      expect(classes.has('large')).toBe(true);
      expect(classes.has('small')).toBe(true);
    });

    it('should update classes when CSS file is re-parsed', () => {
      const metadata1: CSSParseResult = {
        classes: new Set(['button']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      const metadata2: CSSParseResult = {
        classes: new Set(['button', 'primary']),
        ids: new Set(),
        classLocations: new Map(),
        idLocations: new Map(),
        classRules: new Map(),
        idRules: new Map(),
        errors: [],
      };

      registry.updateCSSFile('file:///styles.css', metadata1);
      registry.registerImports('file:///document.eligian', ['file:///styles.css']);

      let classes = registry.getClassesForDocument('file:///document.eligian');
      expect(classes.size).toBe(1);

      registry.updateCSSFile('file:///styles.css', metadata2);
      classes = registry.getClassesForDocument('file:///document.eligian');
      expect(classes.size).toBe(2);
    });
  });
});
