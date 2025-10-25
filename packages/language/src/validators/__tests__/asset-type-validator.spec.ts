/**
 * Unit tests for asset type validation
 *
 * Tests the validateAssetType() function which validates that named imports
 * have either inferrable extensions or explicit type overrides.
 *
 * @see asset-type-validator.ts
 */

import { describe, expect, test } from 'vitest';
import type { NamedImport } from '../../generated/ast.js';
import { validateAssetType } from '../asset-type-validator.js';

// Helper to create mock NamedImport nodes
function createNamedImport(path: string, assetType?: string): NamedImport {
  return {
    $type: 'NamedImport',
    name: 'testImport',
    path,
    assetType,
  } as NamedImport;
}

describe('validateAssetType() - T063', () => {
  describe('Valid cases (should return undefined)', () => {
    test('should accept .html extension (inferrable)', () => {
      const importStmt = createNamedImport('./template.html');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept .css extension (inferrable)', () => {
      const importStmt = createNamedImport('./styles.css');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept .mp4 extension (inferrable)', () => {
      const importStmt = createNamedImport('./video.mp4');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept .mp3 extension (inferrable)', () => {
      const importStmt = createNamedImport('./audio.mp3');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept .webm extension (inferrable)', () => {
      const importStmt = createNamedImport('./video.webm');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept .wav extension (inferrable)', () => {
      const importStmt = createNamedImport('./audio.wav');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept unknown extension with explicit as html', () => {
      const importStmt = createNamedImport('./page.tmpl', 'html');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept unknown extension with explicit as css', () => {
      const importStmt = createNamedImport('./theme.scss', 'css');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept unknown extension with explicit as media', () => {
      const importStmt = createNamedImport('./sound.ogg', 'media');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept ambiguous .ogg with explicit as media', () => {
      const importStmt = createNamedImport('./audio.ogg', 'media');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept inferrable extension with explicit type override', () => {
      // User can be explicit even when not needed
      const importStmt = createNamedImport('./page.html', 'html');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });
  });

  describe('UNKNOWN_EXTENSION errors', () => {
    test('should reject .tmpl extension without explicit type', () => {
      const importStmt = createNamedImport('./page.tmpl');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('UNKNOWN_EXTENSION');
      expect(error?.extension).toBe('tmpl');
      expect(error?.message).toContain('Unknown');
      expect(error?.message).toContain('.tmpl');
      expect(error?.hint).toContain('as html');
      expect(error?.hint).toContain('as css');
      expect(error?.hint).toContain('as media');
    });

    test('should reject .json extension without explicit type', () => {
      const importStmt = createNamedImport('./config.json');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('UNKNOWN_EXTENSION');
      expect(error?.extension).toBe('json');
    });

    test('should reject .pdf extension without explicit type', () => {
      const importStmt = createNamedImport('./document.pdf');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('UNKNOWN_EXTENSION');
      expect(error?.extension).toBe('pdf');
    });

    test('should reject file without extension', () => {
      const importStmt = createNamedImport('./README');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('UNKNOWN_EXTENSION');
    });

    test('should reject .scss extension without explicit type', () => {
      const importStmt = createNamedImport('./theme.scss');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('UNKNOWN_EXTENSION');
      expect(error?.extension).toBe('scss');
    });
  });

  describe('AMBIGUOUS_EXTENSION errors', () => {
    test('should reject .ogg extension without explicit type', () => {
      const importStmt = createNamedImport('./audio.ogg');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('AMBIGUOUS_EXTENSION');
      expect(error?.extension).toBe('ogg');
      expect(error?.message).toContain('Ambiguous');
      expect(error?.message).toContain('.ogg');
      expect(error?.hint).toContain('as media');
    });
  });

  describe('Case-insensitive extension handling', () => {
    test('should accept .HTML (uppercase)', () => {
      const importStmt = createNamedImport('./template.HTML');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should accept .CSS (uppercase)', () => {
      const importStmt = createNamedImport('./styles.CSS');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should reject .TMPL (uppercase unknown extension)', () => {
      const importStmt = createNamedImport('./page.TMPL');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('UNKNOWN_EXTENSION');
      expect(error?.extension).toBe('tmpl'); // Should be lowercased in error
    });

    test('should reject .OGG (uppercase ambiguous extension)', () => {
      const importStmt = createNamedImport('./audio.OGG');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('AMBIGUOUS_EXTENSION');
      expect(error?.extension).toBe('ogg'); // Should be lowercased in error
    });
  });

  describe('Multiple extensions (use last)', () => {
    test('should accept .min.html (inferrable)', () => {
      const importStmt = createNamedImport('./bundle.min.html');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should reject .html.bak (unknown last extension)', () => {
      const importStmt = createNamedImport('./page.html.bak');
      const error = validateAssetType(importStmt);

      expect(error).toBeDefined();
      expect(error?.code).toBe('UNKNOWN_EXTENSION');
      expect(error?.extension).toBe('bak');
    });

    test('should accept .scss.bak with explicit type', () => {
      const importStmt = createNamedImport('./styles.scss.bak', 'css');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    test('should handle paths with directories', () => {
      const importStmt = createNamedImport('../../shared/template.html');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should handle hidden files', () => {
      const importStmt = createNamedImport('./.config.css');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });

    test('should handle complex multi-dot filenames', () => {
      const importStmt = createNamedImport('./my.component.template.html');
      expect(validateAssetType(importStmt)).toBeUndefined();
    });
  });
});
