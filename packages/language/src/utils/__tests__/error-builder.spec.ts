import { describe, expect, test } from 'vitest';
import { createValidationError } from '../error-builder.js';

describe('Error Builder Utilities', () => {
  describe('createValidationError', () => {
    test('should create error with code, message, and hint from definition', () => {
      // Mock error definition function
      const mockDefinition = (name: string) => ({
        message: `Duplicate import name: ${name}`,
        hint: 'Use a unique name for each import',
      });

      const result = createValidationError('DUPLICATE_IMPORT_NAME', mockDefinition, ['myFile']);

      expect(result).toEqual({
        code: 'DUPLICATE_IMPORT_NAME',
        message: 'Duplicate import name: myFile',
        hint: 'Use a unique name for each import',
      });
    });

    test('should create error with additional properties', () => {
      const mockDefinition = (ext: string) => ({
        message: `Unknown extension: ${ext}`,
        hint: 'Use a supported file extension',
      });

      const result = createValidationError('UNKNOWN_EXTENSION', mockDefinition, ['.xyz'], {
        extension: '.xyz',
      });

      expect(result).toEqual({
        code: 'UNKNOWN_EXTENSION',
        message: 'Unknown extension: .xyz',
        hint: 'Use a supported file extension',
        extension: '.xyz',
      });
    });

    test('should handle error definitions with no arguments', () => {
      const mockDefinition = () => ({
        message: 'Absolute paths are not allowed',
        hint: 'Use relative paths starting with ./ or ../',
      });

      const result = createValidationError('ABSOLUTE_PATH', mockDefinition, []);

      expect(result).toEqual({
        code: 'ABSOLUTE_PATH',
        message: 'Absolute paths are not allowed',
        hint: 'Use relative paths starting with ./ or ../',
      });
    });

    test('should handle error definitions with multiple arguments', () => {
      const mockDefinition = (name: string, keywords: Set<string>) => ({
        message: `"${name}" is a reserved keyword`,
        hint: `Reserved keywords: ${Array.from(keywords).join(', ')}`,
      });

      const keywords = new Set(['if', 'else', 'for']);
      const result = createValidationError('RESERVED_KEYWORD', mockDefinition, ['if', keywords]);

      expect(result).toEqual({
        code: 'RESERVED_KEYWORD',
        message: '"if" is a reserved keyword',
        hint: 'Reserved keywords: if, else, for',
      });
    });

    test('should handle error with multiple additional properties', () => {
      const mockDefinition = (ext: string) => ({
        message: `Ambiguous extension: ${ext}`,
        hint: 'Specify the asset type explicitly',
      });

      const result = createValidationError('AMBIGUOUS_EXTENSION', mockDefinition, ['.mp4'], {
        extension: '.mp4',
        importType: 'media',
      });

      expect(result).toEqual({
        code: 'AMBIGUOUS_EXTENSION',
        message: 'Ambiguous extension: .mp4',
        hint: 'Specify the asset type explicitly',
        extension: '.mp4',
        importType: 'media',
      });
    });

    test('should handle error definitions that return computed properties', () => {
      const mockDefinition = (name: string) => {
        const uppercaseName = name.toUpperCase();
        return {
          message: `Conflict with operation: ${uppercaseName}`,
          hint: `The name "${name}" conflicts with a built-in operation`,
        };
      };

      const result = createValidationError('OPERATION_NAME_CONFLICT', mockDefinition, [
        'selectElement',
      ]);

      expect(result).toEqual({
        code: 'OPERATION_NAME_CONFLICT',
        message: 'Conflict with operation: SELECTELEMENT',
        hint: 'The name "selectElement" conflicts with a built-in operation',
      });
    });

    test('should handle empty additional properties object', () => {
      const mockDefinition = (type: string) => ({
        message: `Duplicate default import: ${type}`,
        hint: 'Only one default import per type is allowed',
      });

      const result = createValidationError('DUPLICATE_DEFAULT_IMPORT', mockDefinition, ['css'], {});

      expect(result).toEqual({
        code: 'DUPLICATE_DEFAULT_IMPORT',
        message: 'Duplicate default import: css',
        hint: 'Only one default import per type is allowed',
      });
    });

    test('should preserve type information in additional properties', () => {
      const mockDefinition = (count: number) => ({
        message: `Found ${count} errors`,
        hint: 'Fix the errors above',
      });

      const result = createValidationError('MULTIPLE_ERRORS', mockDefinition, [5], {
        errorCount: 5,
        severity: 'high' as const,
      });

      expect(result).toEqual({
        code: 'MULTIPLE_ERRORS',
        message: 'Found 5 errors',
        hint: 'Fix the errors above',
        errorCount: 5,
        severity: 'high',
      });

      // TypeScript should preserve literal types
      const severityType: 'high' = result.severity;
      expect(severityType).toBe('high');
    });
  });
});
