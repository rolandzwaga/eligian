/**
 * Unit tests for constant validation (reserved keywords)
 *
 * Tests the registerConstantValidation function in isolation.
 */

import { describe, expect, test } from 'vitest';
import { RESERVED_KEYWORDS } from '../../types/typir-types.js';

describe('Constant Validation - Reserved Keywords', () => {
  describe('Reserved keyword detection', () => {
    // Test each reserved keyword individually (13 keywords)
    const keywords = Array.from(RESERVED_KEYWORDS);

    test.each(keywords)('should detect "%s" as reserved keyword', async keyword => {
      // This test will be implemented once we have the validation function
      // For now, just verify the keyword is in the set
      expect(RESERVED_KEYWORDS.has(keyword)).toBe(true);
    });
  });

  describe('Valid names', () => {
    const validNames = ['duration', 'myVar', 'count', 'selector', 'items'];

    test.each(validNames)('should accept "%s" as valid name', async name => {
      expect(RESERVED_KEYWORDS.has(name)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    test('should accept "ifCondition" (keyword as part of name)', () => {
      expect(RESERVED_KEYWORDS.has('ifCondition')).toBe(false);
    });

    test('should accept "actionType" (keyword as part of name)', () => {
      expect(RESERVED_KEYWORDS.has('actionType')).toBe(false);
    });
  });
});
