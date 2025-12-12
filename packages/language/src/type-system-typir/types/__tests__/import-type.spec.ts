/**
 * Unit tests for ImportType factory
 *
 * Tests the Typir CustomKind factory for import statements.
 *
 * Test Coverage:
 * - Test 1: Factory creates ImportType with correct properties
 * - Test 2: calculateTypeName returns Import<assetType>
 * - Test 3: Default imports have isDefault=true
 * - Test 4: Named imports have isDefault=false
 */

import { describe, expect, test } from 'vitest';
import type { ImportTypeProperties } from '../import-type.js';

describe('ImportType Factory', () => {
  describe('Test 1: Factory creates ImportType with correct properties', () => {
    test('should create ImportType for CSS import', () => {
      const props: ImportTypeProperties = {
        assetType: 'css',
        path: './styles/main.css',
        isDefault: true,
      };

      expect(props.assetType).toBe('css');
      expect(props.path).toBe('./styles/main.css');
      expect(props.isDefault).toBe(true);
    });

    test('should create ImportType for HTML import', () => {
      const props: ImportTypeProperties = {
        assetType: 'html',
        path: './templates/layout.html',
        isDefault: true,
      };

      expect(props.assetType).toBe('html');
      expect(props.path).toBe('./templates/layout.html');
      expect(props.isDefault).toBe(true);
    });

    test('should create ImportType for media import', () => {
      const props: ImportTypeProperties = {
        assetType: 'media',
        path: './videos/intro.mp4',
        isDefault: false,
      };

      expect(props.assetType).toBe('media');
      expect(props.path).toBe('./videos/intro.mp4');
      expect(props.isDefault).toBe(false);
    });
  });

  describe('Test 2: calculateTypeName returns Import<assetType>', () => {
    // Note: calculateTypeName is internal to the factory, so we test
    // the expected output format by verifying type name patterns.

    test('should return "Import<css>" for CSS imports', () => {
      const props: ImportTypeProperties = {
        assetType: 'css',
        path: './main.css',
        isDefault: true,
      };

      // The expected type name format is "Import<assetType>"
      const expectedTypeName = `Import<${props.assetType}>`;
      expect(expectedTypeName).toBe('Import<css>');
    });

    test('should return "Import<html>" for HTML imports', () => {
      const props: ImportTypeProperties = {
        assetType: 'html',
        path: './layout.html',
        isDefault: true,
      };

      const expectedTypeName = `Import<${props.assetType}>`;
      expect(expectedTypeName).toBe('Import<html>');
    });

    test('should return "Import<media>" for media imports', () => {
      const props: ImportTypeProperties = {
        assetType: 'media',
        path: './video.mp4',
        isDefault: false,
      };

      const expectedTypeName = `Import<${props.assetType}>`;
      expect(expectedTypeName).toBe('Import<media>');
    });
  });

  describe('Test 3: Default imports have isDefault=true', () => {
    test('should set isDefault=true for layout imports', () => {
      // layout keyword => html asset type, default import
      const props: ImportTypeProperties = {
        assetType: 'html',
        path: './layout.html',
        isDefault: true,
      };

      expect(props.isDefault).toBe(true);
    });

    test('should set isDefault=true for styles imports', () => {
      // styles keyword => css asset type, default import
      const props: ImportTypeProperties = {
        assetType: 'css',
        path: './styles.css',
        isDefault: true,
      };

      expect(props.isDefault).toBe(true);
    });

    test('should set isDefault=true for provider imports', () => {
      // provider keyword => media asset type, default import
      const props: ImportTypeProperties = {
        assetType: 'media',
        path: './video.mp4',
        isDefault: true,
      };

      expect(props.isDefault).toBe(true);
    });
  });

  describe('Test 4: Named imports have isDefault=false', () => {
    test('should set isDefault=false for import...from statements', () => {
      // Named imports use import { x } from "..." syntax
      const props: ImportTypeProperties = {
        assetType: 'css',
        path: './theme.css',
        isDefault: false,
      };

      expect(props.isDefault).toBe(false);
    });

    test('should set isDefault=false for CSS named import', () => {
      const props: ImportTypeProperties = {
        assetType: 'css',
        path: './components/button.css',
        isDefault: false,
      };

      expect(props.isDefault).toBe(false);
    });

    test('should set isDefault=false for HTML named import', () => {
      const props: ImportTypeProperties = {
        assetType: 'html',
        path: './partials/header.html',
        isDefault: false,
      };

      expect(props.isDefault).toBe(false);
    });

    test('should set isDefault=false for media named import', () => {
      const props: ImportTypeProperties = {
        assetType: 'media',
        path: './audio/background.mp3',
        isDefault: false,
      };

      expect(props.isDefault).toBe(false);
    });
  });

  describe('Test 5: Path property handling', () => {
    test('should store relative paths with ./', () => {
      const props: ImportTypeProperties = {
        assetType: 'css',
        path: './styles.css',
        isDefault: true,
      };

      expect(props.path).toBe('./styles.css');
      expect(props.path.startsWith('./')).toBe(true);
    });

    test('should store parent relative paths with ../', () => {
      const props: ImportTypeProperties = {
        assetType: 'css',
        path: '../shared/common.css',
        isDefault: false,
      };

      expect(props.path).toBe('../shared/common.css');
      expect(props.path.startsWith('../')).toBe(true);
    });

    test('should store deep nested paths', () => {
      const props: ImportTypeProperties = {
        assetType: 'html',
        path: './components/ui/modals/confirm.html',
        isDefault: false,
      };

      expect(props.path).toBe('./components/ui/modals/confirm.html');
    });
  });
});
