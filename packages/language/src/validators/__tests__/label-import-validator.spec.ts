/**
 * Unit tests for label import validator
 *
 * Tests pure validation functions in isolation (no Langium dependencies).
 * Follows Constitution Principle II (Test-First Development): These tests
 * were written BEFORE the implementation.
 */

import { describe, expect, it } from 'vitest';
import { validateLabelsJSON, validateSchema } from '../label-import-validator.js';

describe('validateSchema()', () => {
  describe('valid labels JSON', () => {
    it('should pass validation for valid label structure', () => {
      const validData = [
        {
          id: 'mainTitle',
          labels: [
            { id: '111', languageCode: 'en-US', label: 'test 1' },
            { id: '222', languageCode: 'nl-NL', label: 'tezt 1' },
          ],
        },
      ];

      const error = validateSchema(validData);

      expect(error).toBeUndefined();
    });

    it('should pass validation with additional properties (forward compatibility)', () => {
      const validData = [
        {
          id: 'greeting',
          category: 'ui', // Additional property
          labels: [
            {
              id: '1',
              languageCode: 'en-US',
              label: 'Hello',
              pronunciation: 'heh-loh', // Additional property
            },
          ],
        },
      ];

      const error = validateSchema(validData);

      expect(error).toBeUndefined();
    });

    it('should pass validation with multiple label groups', () => {
      const validData = [
        {
          id: 'title',
          labels: [{ id: '1', languageCode: 'en-US', label: 'Title' }],
        },
        {
          id: 'subtitle',
          labels: [{ id: '2', languageCode: 'en-US', label: 'Subtitle' }],
        },
      ];

      const error = validateSchema(validData);

      expect(error).toBeUndefined();
    });
  });

  describe('schema violations', () => {
    it('should fail when label group missing id field', () => {
      const invalidData = [
        {
          // Missing 'id' field
          labels: [{ id: '1', languageCode: 'en-US', label: 'test' }],
        },
      ];

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('required');
      expect(error?.message).toContain('id');
    });

    it('should fail when label group missing labels field', () => {
      const invalidData = [
        {
          id: 'mainTitle',
          // Missing 'labels' field
        },
      ];

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('required');
      expect(error?.message).toContain('labels');
    });

    it('should fail when labels array is empty (minItems violation)', () => {
      const invalidData = [
        {
          id: 'mainTitle',
          labels: [], // Empty array
        },
      ];

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('at least one translation');
    });

    it('should fail when translation missing id field', () => {
      const invalidData = [
        {
          id: 'mainTitle',
          labels: [
            {
              // Missing 'id' field
              languageCode: 'en-US',
              label: 'test',
            },
          ],
        },
      ];

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('required');
      expect(error?.message).toContain('id');
    });

    it('should fail when translation missing languageCode field', () => {
      const invalidData = [
        {
          id: 'mainTitle',
          labels: [
            {
              id: '1',
              // Missing 'languageCode' field
              label: 'test',
            },
          ],
        },
      ];

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('required');
      expect(error?.message).toContain('languageCode');
    });

    it('should fail when translation missing label field', () => {
      const invalidData = [
        {
          id: 'mainTitle',
          labels: [
            {
              id: '1',
              languageCode: 'en-US',
              // Missing 'label' field
            },
          ],
        },
      ];

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('required');
    });

    it('should fail when languageCode has invalid format', () => {
      const invalidData = [
        {
          id: 'mainTitle',
          labels: [
            {
              id: '1',
              languageCode: 'en_US', // Invalid: underscore instead of hyphen
              label: 'Test',
            },
          ],
        },
      ];

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('pattern');
    });

    it('should fail when languageCode is all lowercase', () => {
      const invalidData = [
        {
          id: 'mainTitle',
          labels: [
            {
              id: '1',
              languageCode: 'en-us', // Invalid: region code should be uppercase
              label: 'Test',
            },
          ],
        },
      ];

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('pattern');
    });

    it('should fail when root is not an array', () => {
      const invalidData = {
        id: 'mainTitle',
        labels: [],
      };

      const error = validateSchema(invalidData);

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.message).toContain('must be a array');
    });
  });
});

describe('validateLabelsJSON()', () => {
  describe('valid JSON content', () => {
    it('should pass validation for valid JSON string', () => {
      const validJSON = JSON.stringify([
        {
          id: 'mainTitle',
          labels: [{ id: '111', languageCode: 'en-US', label: 'test 1' }],
        },
      ]);

      const error = validateLabelsJSON(validJSON, './labels.json');

      expect(error).toBeUndefined();
    });
  });

  describe('JSON syntax errors', () => {
    it('should fail with invalid JSON syntax', () => {
      const invalidJSON = '[{id: "test"}]'; // Missing quotes around key

      const error = validateLabelsJSON(invalidJSON, './labels.json');

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_json');
      expect(error?.message).toContain('Invalid JSON syntax');
      expect(error?.message).toContain('./labels.json');
    });

    it('should include file path in syntax error message', () => {
      const invalidJSON = '[{]'; // Unclosed bracket

      const error = validateLabelsJSON(invalidJSON, './test/labels.json');

      expect(error).toBeDefined();
      expect(error?.path).toBe('./test/labels.json');
      expect(error?.message).toContain('./test/labels.json');
    });

    it('should provide helpful hint for JSON syntax errors', () => {
      const invalidJSON = '{"test":}';

      const error = validateLabelsJSON(invalidJSON, './labels.json');

      expect(error).toBeDefined();
      expect(error?.hint).toContain('commas');
    });
  });

  describe('schema validation errors propagation', () => {
    it('should propagate schema validation errors', () => {
      const validJSONButInvalidSchema = JSON.stringify([
        {
          // Missing 'id' field
          labels: [{ id: '1', languageCode: 'en-US', label: 'test' }],
        },
      ]);

      const error = validateLabelsJSON(validJSONButInvalidSchema, './labels.json');

      expect(error).toBeDefined();
      expect(error?.code).toBe('invalid_labels_schema');
      expect(error?.path).toBe('./labels.json');
    });
  });
});
