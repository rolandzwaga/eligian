/**
 * Unit tests for the Typir time-expression helpers.
 *
 * Regression for audit finding "extractTimeValue ignores m/h units, relative
 * times and property-chain times": every unit must be converted to seconds the
 * same way the compiler does, and values that cannot be known statically
 * (relative `+2s`, `$globaldata.x`) must come back as `undefined` instead of 0.
 */
import { describe, expect, test } from 'vitest';
import { extractTimeValue, parseTimeRange } from '../time-expression.js';

const lit = (value: number, unit?: string) => ({ $type: 'TimeLiteral', value, unit }) as any;
const rel = (value: number, unit?: string) =>
  ({ $type: 'RelativeTimeLiteral', value, unit }) as any;
const chain = () =>
  ({ $type: 'PropertyChainReference', scope: 'globaldata', properties: ['x'] }) as any;
const bin = (left: unknown, op: string, right: unknown) =>
  ({ $type: 'BinaryTimeExpression', left, op, right }) as any;
const range = (start: unknown, end: unknown) => ({ $type: 'TimeRange', start, end }) as any;

describe('extractTimeValue', () => {
  test('converts every time unit to seconds', () => {
    expect(extractTimeValue(lit(500, 'ms'))).toBe(0.5);
    expect(extractTimeValue(lit(2, 's'))).toBe(2);
    expect(extractTimeValue(lit(2))).toBe(2);
    expect(extractTimeValue(lit(1, 'm'))).toBe(60);
    expect(extractTimeValue(lit(1.5, 'h'))).toBe(5400);
  });

  test('evaluates binary time expressions with mixed units', () => {
    expect(extractTimeValue(bin(lit(1, 'm'), '+', lit(500, 'ms')))).toBe(60.5);
    expect(extractTimeValue(bin(lit(0, 's'), '-', lit(1, 's')))).toBe(-1);
    expect(extractTimeValue(bin(lit(2, 's'), '*', lit(3)))).toBe(6);
    expect(extractTimeValue(bin(lit(1, 'm'), '/', lit(2)))).toBe(30);
  });

  test('returns undefined for values that are not statically known', () => {
    expect(extractTimeValue(undefined)).toBeUndefined();
    expect(extractTimeValue(rel(2, 's'))).toBeUndefined();
    expect(extractTimeValue(chain())).toBeUndefined();
    expect(extractTimeValue(bin(lit(1, 's'), '+', chain()))).toBeUndefined();
    expect(extractTimeValue(bin(lit(1, 's'), '/', lit(0)))).toBeUndefined();
  });
});

describe('parseTimeRange', () => {
  test('mixed-unit absolute ranges compare in seconds', () => {
    expect(parseTimeRange(range(lit(500, 'ms'), lit(2, 's')))).toEqual({
      start: 0.5,
      end: 2,
      duration: 1.5,
    });
    expect(parseTimeRange(range(lit(90, 's'), lit(2, 'm'))).duration).toBe(30);
    expect(parseTimeRange(range(lit(61, 'm'), lit(1, 'h'))).duration).toBe(-60);
    expect(parseTimeRange(range(lit(2, 'm'), lit(90, 's'))).duration).toBe(-30);
  });

  test('two relative times share the previous-event base, so their duration is known', () => {
    const result = parseTimeRange(range(rel(0, 's'), rel(5, 's')));
    expect(result.start).toBeUndefined();
    expect(result.end).toBeUndefined();
    expect(result.duration).toBe(5);
    expect(parseTimeRange(range(rel(5, 's'), rel(2, 's'))).duration).toBe(-3);
  });

  test('mixing absolute and relative times leaves the duration unknown', () => {
    const result = parseTimeRange(range(lit(2, 's'), rel(1, 's')));
    expect(result).toEqual({ start: 2, end: undefined, duration: undefined });
  });

  test('property-chain times leave the duration unknown', () => {
    expect(parseTimeRange(range(lit(0, 's'), chain()))).toEqual({
      start: 0,
      end: undefined,
      duration: undefined,
    });
  });

  test('a missing time range yields no values', () => {
    expect(parseTimeRange(undefined)).toEqual({
      start: undefined,
      end: undefined,
      duration: undefined,
    });
  });
});
