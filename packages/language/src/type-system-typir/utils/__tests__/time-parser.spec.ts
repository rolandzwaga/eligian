/**
 * Unit tests for time expression parser
 * Test-First Development: Tests written BEFORE implementation
 */
import { describe, expect, it } from 'vitest';
import { parseTimeExpression } from '../time-parser.js';

describe('parseTimeExpression', () => {
  describe('seconds format', () => {
    it('should parse integer seconds', () => {
      expect(parseTimeExpression('5s')).toBe(5);
      expect(parseTimeExpression('10s')).toBe(10);
      expect(parseTimeExpression('0s')).toBe(0);
    });

    it('should parse decimal seconds', () => {
      expect(parseTimeExpression('1.5s')).toBe(1.5);
      expect(parseTimeExpression('0.5s')).toBe(0.5);
      expect(parseTimeExpression('2.75s')).toBe(2.75);
    });
  });

  describe('milliseconds format', () => {
    it('should parse integer milliseconds', () => {
      expect(parseTimeExpression('500ms')).toBe(0.5);
      expect(parseTimeExpression('1000ms')).toBe(1);
      expect(parseTimeExpression('0ms')).toBe(0);
    });

    it('should parse decimal milliseconds', () => {
      expect(parseTimeExpression('500.5ms')).toBe(0.5005);
      expect(parseTimeExpression('1500.75ms')).toBe(1.50075);
    });
  });

  describe('invalid formats', () => {
    it('should return 0 for invalid format', () => {
      expect(parseTimeExpression('invalid')).toBe(0);
      expect(parseTimeExpression('5')).toBe(0);
      expect(parseTimeExpression('5m')).toBe(0);
      expect(parseTimeExpression('')).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero values', () => {
      expect(parseTimeExpression('0s')).toBe(0);
      expect(parseTimeExpression('0ms')).toBe(0);
    });

    it('should handle very small values', () => {
      expect(parseTimeExpression('0.001s')).toBe(0.001);
      expect(parseTimeExpression('1ms')).toBe(0.001);
    });
  });
});
