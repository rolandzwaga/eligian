import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '../../generated/ast.js';
import { generateJSDocTemplate } from '../jsdoc-template-generator.js';

describe('JSDoc Template Generator', () => {
  describe('action with no parameters', () => {
    it('should generate template with only description placeholder', () => {
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
        parameters: [],
      } as ActionDefinition;

      const template = generateJSDocTemplate(mockAction);

      expect(template).toContain('/**');
      expect(template).toContain(' * '); // Blank description line
      expect(template).toContain(' */');
      expect(template).not.toContain('@param'); // No parameters
    });
  });

  describe('action with typed parameter', () => {
    it('should generate @param with type from action signature', () => {
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'fadeIn',
        parameters: [{ name: 'selector', type: 'string' }],
      } as unknown as ActionDefinition;

      const template = generateJSDocTemplate(mockAction);

      expect(template).toContain('/**');
      expect(template).toContain(' * '); // Description placeholder
      expect(template).toContain(' * @param {string} selector');
      expect(template).toContain(' */');
    });
  });

  describe('action with untyped parameter', () => {
    it('should generate @param with unknown type for inference', () => {
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
        parameters: [{ name: 'foo', type: undefined }],
      } as unknown as ActionDefinition;

      const template = generateJSDocTemplate(mockAction);

      expect(template).toContain(' * @param {unknown} foo');
    });
  });

  describe('action with 5 parameters', () => {
    it('should generate 5 @param lines in correct order', () => {
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
        parameters: [
          { name: 'a', type: 'string' },
          { name: 'b', type: 'number' },
          { name: 'c', type: 'boolean' },
          { name: 'd', type: undefined },
          { name: 'e', type: 'object' },
        ],
      } as unknown as ActionDefinition;

      const template = generateJSDocTemplate(mockAction);

      const lines = template.split('\n');
      expect(lines).toHaveLength(8); // /** + desc + 5 params + */ = 1+1+5+1 = 8

      expect(template).toContain('@param {string} a');
      expect(template).toContain('@param {number} b');
      expect(template).toContain('@param {boolean} c');
      expect(template).toContain('@param {unknown} d');
      expect(template).toContain('@param {object} e');

      // Check order
      const aIndex = template.indexOf('@param {string} a');
      const bIndex = template.indexOf('@param {number} b');
      const cIndex = template.indexOf('@param {boolean} c');
      const dIndex = template.indexOf('@param {unknown} d');
      const eIndex = template.indexOf('@param {object} e');

      expect(aIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(cIndex);
      expect(cIndex).toBeLessThan(dIndex);
      expect(dIndex).toBeLessThan(eIndex);
    });
  });

  describe('action with 20 parameters (performance test)', () => {
    it('should generate 20 @param lines without degradation', () => {
      const parameters = Array.from({ length: 20 }, (_, i) => ({
        name: `param${i}`,
        type: 'string',
      }));

      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
        parameters,
      } as unknown as ActionDefinition;

      const template = generateJSDocTemplate(mockAction);

      const lines = template.split('\n');
      expect(lines).toHaveLength(23); // /** + desc + 20 params + */ = 1+1+20+1 = 23

      // Verify all params present
      for (let i = 0; i < 20; i++) {
        expect(template).toContain(`@param {string} param${i}`);
      }
    });
  });

  describe('blank description line (FR-011)', () => {
    it('should include blank description line after opening', () => {
      const mockAction = {
        $type: 'RegularActionDefinition',
        name: 'test',
        parameters: [{ name: 'foo', type: 'string' }],
      } as unknown as ActionDefinition;

      const template = generateJSDocTemplate(mockAction);

      const lines = template.split('\n');
      expect(lines[0]).toBe('/**');
      expect(lines[1]).toBe(' * '); // Blank description line with trailing space
      expect(lines[2]).toContain('@param'); // First param
    });
  });
});
