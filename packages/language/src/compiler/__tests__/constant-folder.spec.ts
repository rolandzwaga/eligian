/**
 * Constant Folder Tests
 *
 * Tests the constant folding optimization that detects compile-time
 * constants and builds a map for inlining during transformation.
 *
 * Test-First Development: These tests are written BEFORE implementing
 * buildConstantMap to ensure the function meets all requirements.
 */

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { buildConstantMap } from '../constant-folder.js';

const services = createEligianServices(EmptyFileSystem).Eligian;

/**
 * Parse Eligian source code into an AST Program
 */
async function parseEligian(text: string): Promise<Program> {
  const document = await parseDocument(services, text);
  return document.parseResult.value as Program;
}

describe('Constant Folder - buildConstantMap', () => {
  describe('String constants', () => {
    test('should detect string constant', async () => {
      const program = await parseEligian('const MESSAGE = "hello";');
      const map = buildConstantMap(program);

      expect(map.size).toBe(1);
      expect(map.has('MESSAGE')).toBe(true);

      const constant = map.get('MESSAGE')!;
      expect(constant.name).toBe('MESSAGE');
      expect(constant.value).toBe('hello');
      expect(constant.type).toBe('string');
    });

    test('should handle multiple string constants', async () => {
      const program = await parseEligian(`
        const FIRST = "foo";
        const SECOND = "bar";
        const THIRD = "baz";
      `);
      const map = buildConstantMap(program);

      expect(map.size).toBe(3);
      expect(map.has('FIRST')).toBe(true);
      expect(map.has('SECOND')).toBe(true);
      expect(map.has('THIRD')).toBe(true);

      expect(map.get('FIRST')!.value).toBe('foo');
      expect(map.get('SECOND')!.value).toBe('bar');
      expect(map.get('THIRD')!.value).toBe('baz');
    });

    test('should preserve type information for strings', async () => {
      const program = await parseEligian('const TEXT = "example";');
      const map = buildConstantMap(program);

      const constant = map.get('TEXT')!;
      expect(constant.type).toBe('string');
      expect(typeof constant.value).toBe('string');
    });

    test('should handle string with single quotes', async () => {
      const program = await parseEligian("const GREETING = 'hello';");
      const map = buildConstantMap(program);

      expect(map.has('GREETING')).toBe(true);
      expect(map.get('GREETING')!.value).toBe('hello');
    });
  });

  describe('Number constants', () => {
    test('should detect number constant', async () => {
      const program = await parseEligian('const DELAY = 1000;');
      const map = buildConstantMap(program);

      expect(map.size).toBe(1);
      expect(map.has('DELAY')).toBe(true);

      const constant = map.get('DELAY')!;
      expect(constant.name).toBe('DELAY');
      expect(constant.value).toBe(1000);
      expect(constant.type).toBe('number');
    });

    test('should handle integer and decimal numbers', async () => {
      const program = await parseEligian(`
        const INT = 42;
        const FLOAT = 3.14;
      `);
      const map = buildConstantMap(program);

      expect(map.size).toBe(2);
      expect(map.get('INT')!.value).toBe(42);
      expect(map.get('INT')!.type).toBe('number');
      expect(map.get('FLOAT')!.value).toBe(3.14);
      expect(map.get('FLOAT')!.type).toBe('number');
    });

    test('should preserve type information for numbers', async () => {
      const program = await parseEligian('const COUNT = 5;');
      const map = buildConstantMap(program);

      const constant = map.get('COUNT')!;
      expect(constant.type).toBe('number');
      expect(typeof constant.value).toBe('number');
    });
  });

  describe('Boolean constants', () => {
    test('should detect boolean constant (true)', async () => {
      const program = await parseEligian('const ENABLED = true;');
      const map = buildConstantMap(program);

      expect(map.size).toBe(1);
      expect(map.has('ENABLED')).toBe(true);

      const constant = map.get('ENABLED')!;
      expect(constant.name).toBe('ENABLED');
      expect(constant.value).toBe(true);
      expect(constant.type).toBe('boolean');
    });

    test('should detect boolean constant (false)', async () => {
      const program = await parseEligian('const DISABLED = false;');
      const map = buildConstantMap(program);

      expect(map.size).toBe(1);
      expect(map.has('DISABLED')).toBe(true);

      const constant = map.get('DISABLED')!;
      expect(constant.name).toBe('DISABLED');
      expect(constant.value).toBe(false);
      expect(constant.type).toBe('boolean');
    });

    test('should preserve type information for booleans', async () => {
      const program = await parseEligian('const FLAG = true;');
      const map = buildConstantMap(program);

      const constant = map.get('FLAG')!;
      expect(constant.type).toBe('boolean');
      expect(typeof constant.value).toBe('boolean');
    });
  });

  describe('Mixed types', () => {
    test('should handle multiple constants of different types', async () => {
      const program = await parseEligian(`
        const MESSAGE = "hello";
        const COUNT = 42;
        const ENABLED = true;
      `);
      const map = buildConstantMap(program);

      expect(map.size).toBe(3);
      expect(map.get('MESSAGE')!.type).toBe('string');
      expect(map.get('COUNT')!.type).toBe('number');
      expect(map.get('ENABLED')!.type).toBe('boolean');
    });
  });

  describe('Source location tracking', () => {
    test('should include source location for error reporting', async () => {
      const program = await parseEligian('const TEST = "value";');
      const map = buildConstantMap(program);

      const constant = map.get('TEST')!;
      expect(constant.sourceLocation).toBeDefined();
      expect(constant.sourceLocation?.line).toBeGreaterThanOrEqual(0);
      expect(constant.sourceLocation?.column).toBeGreaterThanOrEqual(0);
    });
  });
});
