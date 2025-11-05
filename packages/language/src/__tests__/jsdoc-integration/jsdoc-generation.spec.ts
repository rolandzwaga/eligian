import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import { generateJSDocContent } from '../../jsdoc/jsdoc-template-generator.js';
import { findActionBelow } from '../../utils/ast-navigation.js';

const services = createEligianServices(EmptyFileSystem).Eligian;

describe('JSDoc Generation (Language Server Handler)', () => {
  test('should find action below cursor position', async () => {
    const text = `

      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
      ]
    `;

    const document = await parseDocument(services, text);

    // Position on line above the action (where /** */ would be)
    const position = { line: 1, character: 0 };

    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeDefined();
    expect(actionDef?.name).toBe('fadeIn');
  });

  test('should generate JSDoc content with typed parameters', async () => {
    const text = `
      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
      ]
    `;

    const document = await parseDocument(services, text);
    const position = { line: 0, character: 0 };
    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeDefined();

    const content = generateJSDocContent(actionDef!);

    // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing VS Code snippet syntax
    expect(content).toContain('${1:Description}');
    expect(content).toContain('@param {string} selector');
    expect(content).toContain('@param {number} duration');
  });

  test('should generate JSDoc content with untyped parameters', async () => {
    const text = `
      action test(foo, bar) [
        selectElement(foo)
      ]
    `;

    const document = await parseDocument(services, text);
    const position = { line: 0, character: 0 };
    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeDefined();

    const content = generateJSDocContent(actionDef!);

    // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing VS Code snippet syntax
    expect(content).toContain('${1:Description}');
    expect(content).toContain('@param {unknown} foo');
    expect(content).toContain('@param {unknown} bar');
  });

  test('should generate JSDoc content with no parameters', async () => {
    const text = `
      action test() [
        selectElement("#box")
      ]
    `;

    const document = await parseDocument(services, text);
    const position = { line: 0, character: 0 };
    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeDefined();

    const content = generateJSDocContent(actionDef!);

    // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing VS Code snippet syntax
    expect(content).toContain('${1:Description}');
    expect(content).not.toContain('@param'); // No parameters
  });

  test('should return null when no action below cursor', async () => {
    const text = `
      action fadeIn() [ selectElement("#box") ]



      timeline "test" in ".container" using raf {}
    `;

    const document = await parseDocument(services, text);

    // Position above the timeline (not above an action)
    const position = { line: 3, character: 0 };

    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeUndefined();
  });

  test('should generate JSDoc with mixed typed and untyped parameters', async () => {
    const text = `
      action process(name: string, count, options: object) [
        selectElement(name)
      ]
    `;

    const document = await parseDocument(services, text);
    const position = { line: 0, character: 0 };
    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeDefined();

    const content = generateJSDocContent(actionDef!);

    expect(content).toContain('@param {string} name');
    expect(content).toContain('@param {unknown} count');
    expect(content).toContain('@param {object} options');
  });

  test('should generate JSDoc content with proper line prefixes', async () => {
    const text = `
      action test(foo: string) [
        selectElement(foo)
      ]
    `;

    const document = await parseDocument(services, text);
    const position = { line: 0, character: 0 };
    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeDefined();

    const content = generateJSDocContent(actionDef!);

    // Should have ' * ' prefix on each line
    const lines = content.split('\n');
    for (const line of lines) {
      expect(line).toMatch(/^ \* /);
    }
  });

  test('should handle action with array type parameter', async () => {
    const text = `
      action processItems(items: array) [
        selectElement("#box")
      ]
    `;

    const document = await parseDocument(services, text);
    const position = { line: 0, character: 0 };
    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeDefined();

    const content = generateJSDocContent(actionDef!);

    expect(content).toContain('@param {array} items');
  });

  test('should handle action with boolean type parameter', async () => {
    const text = `
      action toggle(enabled: boolean) [
        selectElement("#box")
      ]
    `;

    const document = await parseDocument(services, text);
    const position = { line: 0, character: 0 };
    const actionDef = findActionBelow(document, position);

    expect(actionDef).toBeDefined();

    const content = generateJSDocContent(actionDef!);

    expect(content).toContain('@param {boolean} enabled');
  });
});
