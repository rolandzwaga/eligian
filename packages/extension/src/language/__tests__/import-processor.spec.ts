/**
 * Generic Import Processor Tests
 *
 * Tests the generic import handler that processes CSS, labels, and HTML imports
 * with a unified pattern.
 *
 * This follows TDD approach:
 * 1. Write failing tests
 * 2. Implement generic processor
 * 3. Make tests pass
 */

import * as path from 'node:path';
import type { DefaultImport, Program } from '@eligian/language';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { URI } from 'vscode-uri';
import type { ImportProcessorConfig } from '../import-processor.js';
import { processImports } from '../import-processor.js';

/**
 * Mock connection for notification testing
 */
interface MockConnection {
  sendNotification: ReturnType<typeof vi.fn>;
}

/**
 * Helper to create mock Program AST with imports
 */
function createMockProgram(imports: Array<{ type: string; path: string }>): Program {
  return {
    $type: 'Program',
    statements: imports.map(imp => ({
      $type: 'DefaultImport',
      type: imp.type,
      path: `"${imp.path}"`,
    })) as DefaultImport[],
  } as Program;
}

describe('Generic Import Processor (TDD)', () => {
  let mockConnection: MockConnection;
  const testDocUri = 'file:///test/document.eligian';
  const testDocDir = '/test';

  beforeEach(() => {
    mockConnection = {
      sendNotification: vi.fn(),
    };
  });

  describe('Path Resolution', () => {
    test('should clean ./ prefix from relative paths', () => {
      const testPath = './styles.css';
      const cleanPath = testPath.startsWith('./') ? testPath.substring(2) : testPath;
      expect(cleanPath).toBe('styles.css');
    });

    test('should handle paths without ./ prefix', () => {
      const testPath = 'styles.css';
      const cleanPath = testPath.startsWith('./') ? testPath.substring(2) : testPath;
      expect(cleanPath).toBe('styles.css');
    });

    test('should resolve to absolute path using path.join', () => {
      const docDir = '/test';
      const cleanPath = 'styles.css';
      const absolutePath = path.join(docDir, cleanPath);

      expect(absolutePath).toContain('styles.css');
    });

    test('should convert absolute path to URI', () => {
      const absolutePath = '/test/styles.css';
      const uri = URI.file(absolutePath).toString();

      expect(uri).toContain('file:///');
      expect(uri).toContain('styles.css');
    });
  });

  describe('CSS Import Processing (one-to-many)', () => {
    test('should extract multiple CSS imports from AST', () => {
      const mockRegistry = {
        updateFile: vi.fn(),
        registerImports: vi.fn(),
      };

      const mockProgram = createMockProgram([
        { type: 'styles', path: './style1.css' },
        { type: 'styles', path: './style2.css' },
      ]);

      const config: ImportProcessorConfig<{ classes: Set<string> }> = {
        importType: 'styles',
        parseFile: vi.fn().mockReturnValue({ classes: new Set(['button']) }),
        createEmptyMetadata: () => ({ classes: new Set() }),
        registry: mockRegistry,
        notification: {
          type: 'eligian/cssImportsDiscovered',
          createParams: (docUri, fileUris) => ({ documentUri: docUri, cssFileUris: fileUris }),
        },
        cardinality: 'many',
      };

      processImports(testDocUri, mockProgram, testDocDir, mockConnection, config);

      // Should call updateFile for each CSS file (even though parsing will fail - empty metadata)
      expect(mockRegistry.updateFile).toHaveBeenCalledTimes(2);
      expect(mockRegistry.updateFile).toHaveBeenCalledWith(expect.stringContaining('style1.css'), {
        classes: new Set(),
      });
      expect(mockRegistry.updateFile).toHaveBeenCalledWith(expect.stringContaining('style2.css'), {
        classes: new Set(),
      });

      // Should call registerImports once with array of URIs
      expect(mockRegistry.registerImports).toHaveBeenCalledTimes(1);
      expect(mockRegistry.registerImports).toHaveBeenCalledWith(
        testDocUri,
        expect.arrayContaining([
          expect.stringContaining('style1.css'),
          expect.stringContaining('style2.css'),
        ])
      );
    });

    test('should send notification with all CSS file URIs', () => {
      const mockRegistry = {
        updateFile: vi.fn(),
        registerImports: vi.fn(),
      };

      const mockProgram = createMockProgram([
        { type: 'styles', path: './style1.css' },
        { type: 'styles', path: './style2.css' },
      ]);

      const config: ImportProcessorConfig<{ classes: Set<string> }> = {
        importType: 'styles',
        parseFile: vi.fn().mockReturnValue({ classes: new Set(['button']) }),
        createEmptyMetadata: () => ({ classes: new Set() }),
        registry: mockRegistry,
        notification: {
          type: 'eligian/cssImportsDiscovered',
          createParams: (docUri, fileUris) => ({ documentUri: docUri, cssFileUris: fileUris }),
        },
        cardinality: 'many',
      };

      processImports(testDocUri, mockProgram, testDocDir, mockConnection, config);

      expect(mockConnection.sendNotification).toHaveBeenCalledTimes(1);
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'eligian/cssImportsDiscovered',
        expect.objectContaining({
          documentUri: testDocUri,
          cssFileUris: expect.arrayContaining([
            expect.stringContaining('style1.css'),
            expect.stringContaining('style2.css'),
          ]),
        })
      );
    });
  });

  describe('Labels Import Processing (one-to-one)', () => {
    test('should extract single labels import from AST', () => {
      const mockRegistry = {
        updateFile: vi.fn(),
        registerImports: vi.fn(),
        hasImport: vi.fn().mockReturnValue(false),
      };

      const mockProgram = createMockProgram([{ type: 'labels', path: './labels.json' }]);

      const config: ImportProcessorConfig<Array<{ id: string }>> = {
        importType: 'labels',
        parseFile: vi.fn().mockReturnValue([{ id: 'test' }]),
        createEmptyMetadata: () => [],
        registry: mockRegistry,
        notification: {
          type: 'eligian/labelsImportsDiscovered',
          createParams: (docUri, fileUri) => ({ documentUri: docUri, labelsFileUri: fileUri }),
        },
        cardinality: 'one',
      };

      processImports(testDocUri, mockProgram, testDocDir, mockConnection, config);

      // Should call updateFile once (parsing will fail, so empty metadata)
      expect(mockRegistry.updateFile).toHaveBeenCalledTimes(1);
      expect(mockRegistry.updateFile).toHaveBeenCalledWith(
        expect.stringContaining('labels.json'),
        []
      );

      // Should call registerImports once with single URI
      expect(mockRegistry.registerImports).toHaveBeenCalledTimes(1);
      expect(mockRegistry.registerImports).toHaveBeenCalledWith(
        testDocUri,
        expect.stringContaining('labels.json')
      );

      // Should send notification since it's a new import
      expect(mockConnection.sendNotification).toHaveBeenCalledTimes(1);
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'eligian/labelsImportsDiscovered',
        expect.objectContaining({
          documentUri: testDocUri,
          labelsFileUri: expect.stringContaining('labels.json'),
        })
      );
    });

    test('should use hasImport() to prevent infinite loops', () => {
      const mockRegistry = {
        updateFile: vi.fn(),
        registerImports: vi.fn(),
        hasImport: vi.fn().mockReturnValue(true), // Already registered
      };

      const mockProgram = createMockProgram([{ type: 'labels', path: './labels.json' }]);

      const config: ImportProcessorConfig<Array<{ id: string }>> = {
        importType: 'labels',
        parseFile: vi.fn().mockReturnValue([{ id: 'test' }]),
        createEmptyMetadata: () => [],
        registry: mockRegistry,
        notification: {
          type: 'eligian/labelsImportsDiscovered',
          createParams: (docUri, fileUri) => ({ documentUri: docUri, labelsFileUri: fileUri }),
        },
        cardinality: 'one',
      };

      processImports(testDocUri, mockProgram, testDocDir, mockConnection, config);

      // Should check hasImport to prevent infinite loops
      expect(mockRegistry.hasImport).toHaveBeenCalledWith(testDocUri);

      // Should still update file and register imports
      expect(mockRegistry.updateFile).toHaveBeenCalledTimes(1);
      expect(mockRegistry.registerImports).toHaveBeenCalledTimes(1);

      // Should NOT send notification since it's already registered
      expect(mockConnection.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('HTML Import Processing (one-to-one)', () => {
    test('should extract single HTML/layout import from AST', () => {
      const mockRegistry = {
        updateFile: vi.fn(),
        registerImports: vi.fn(),
        hasImport: vi.fn().mockReturnValue(false),
      };

      const mockProgram = createMockProgram([{ type: 'layout', path: './layout.html' }]);

      const config: ImportProcessorConfig<{ content: string }> = {
        importType: 'layout',
        parseFile: vi.fn().mockReturnValue({ content: '<div>test</div>' }),
        createEmptyMetadata: () => ({ content: '' }),
        registry: mockRegistry,
        notification: {
          type: 'eligian/htmlImportsDiscovered',
          createParams: (docUri, fileUri) => ({ documentUri: docUri, htmlFileUri: fileUri }),
        },
        cardinality: 'one',
      };

      processImports(testDocUri, mockProgram, testDocDir, mockConnection, config);

      // Should call updateFile once (parsing will fail, so empty metadata)
      expect(mockRegistry.updateFile).toHaveBeenCalledTimes(1);
      expect(mockRegistry.updateFile).toHaveBeenCalledWith(expect.stringContaining('layout.html'), {
        content: '',
      });

      // Should call registerImports once with single URI
      expect(mockRegistry.registerImports).toHaveBeenCalledTimes(1);
      expect(mockRegistry.registerImports).toHaveBeenCalledWith(
        testDocUri,
        expect.stringContaining('layout.html')
      );

      // Should send notification
      expect(mockConnection.sendNotification).toHaveBeenCalledTimes(1);
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'eligian/htmlImportsDiscovered',
        expect.objectContaining({
          documentUri: testDocUri,
          htmlFileUri: expect.stringContaining('layout.html'),
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should register empty metadata when file does not exist', () => {
      const mockRegistry = {
        updateFile: vi.fn(),
        registerImports: vi.fn(),
      };

      const mockProgram = createMockProgram([{ type: 'styles', path: './missing.css' }]);

      const parseFileMock = vi.fn().mockImplementation(() => {
        throw new Error('ENOENT: file not found');
      });

      const config: ImportProcessorConfig<{ classes: Set<string> }> = {
        importType: 'styles',
        parseFile: parseFileMock,
        createEmptyMetadata: () => ({ classes: new Set() }),
        registry: mockRegistry,
        notification: {
          type: 'eligian/cssImportsDiscovered',
          createParams: (docUri, fileUris) => ({ documentUri: docUri, cssFileUris: fileUris }),
        },
        cardinality: 'many',
      };

      processImports(testDocUri, mockProgram, testDocDir, mockConnection, config);

      // Should register empty metadata even when file doesn't exist
      expect(mockRegistry.updateFile).toHaveBeenCalledWith(expect.stringContaining('missing.css'), {
        classes: new Set(),
      });

      // Should still register the import
      expect(mockRegistry.registerImports).toHaveBeenCalledTimes(1);

      // Should still send notification
      expect(mockConnection.sendNotification).toHaveBeenCalledTimes(1);
    });

    test('should continue processing other imports when one fails', () => {
      const mockRegistry = {
        updateFile: vi.fn(),
        registerImports: vi.fn(),
      };

      const mockProgram = createMockProgram([
        { type: 'styles', path: './good.css' },
        { type: 'styles', path: './bad.css' },
        { type: 'styles', path: './good2.css' },
      ]);

      const parseFileMock = vi
        .fn()
        .mockReturnValueOnce({ classes: new Set(['button']) })
        .mockImplementationOnce(() => {
          throw new Error('Parse error');
        })
        .mockReturnValueOnce({ classes: new Set(['primary']) });

      const config: ImportProcessorConfig<{ classes: Set<string> }> = {
        importType: 'styles',
        parseFile: parseFileMock,
        createEmptyMetadata: () => ({ classes: new Set() }),
        registry: mockRegistry,
        notification: {
          type: 'eligian/cssImportsDiscovered',
          createParams: (docUri, fileUris) => ({ documentUri: docUri, cssFileUris: fileUris }),
        },
        cardinality: 'many',
      };

      processImports(testDocUri, mockProgram, testDocDir, mockConnection, config);

      // Should process all 3 files despite middle one failing
      expect(mockRegistry.updateFile).toHaveBeenCalledTimes(3);

      // Should register all 3 imports
      expect(mockRegistry.registerImports).toHaveBeenCalledTimes(1);

      // Should send notification with all 3 URIs
      expect(mockConnection.sendNotification).toHaveBeenCalledTimes(1);
    });
  });
});
