/**
 * HTMLRegistryService bookkeeping (audit 2026-10-22, low #34).
 */

import { describe, expect, test } from 'vitest';
import { HTMLRegistryService } from '../html-registry.js';

const meta = (content: string) => ({ content });

describe('HTMLRegistryService', () => {
  test('hasImport can be asked about a specific layout file', () => {
    const registry = new HTMLRegistryService();
    registry.updateHTMLFile('file:///a.html', meta('a'));
    registry.registerImports('file:///p.eligian', 'file:///a.html');

    expect(registry.hasImport('file:///p.eligian')).toBe(true);
    expect(registry.hasImport('file:///p.eligian', 'file:///a.html')).toBe(true);
    // Retargeting to another layout is detectable instead of looking "already imported"
    expect(registry.hasImport('file:///p.eligian', 'file:///b.html')).toBe(false);
    expect(registry.hasImport('file:///other.eligian', 'file:///a.html')).toBe(false);
  });

  test('retargeting a document prunes the old layout when nobody else uses it', () => {
    const registry = new HTMLRegistryService();
    registry.updateHTMLFile('file:///a.html', meta('a'));
    registry.registerImports('file:///p.eligian', 'file:///a.html');
    registry.updateHTMLFile('file:///b.html', meta('b'));
    registry.registerImports('file:///p.eligian', 'file:///b.html');

    expect(registry.getHTMLFileURI('file:///p.eligian')).toBe('file:///b.html');
    expect(registry.getHTMLForDocument('file:///p.eligian')?.content).toBe('b');
    expect(registry.getDocumentsForHTMLFile('file:///a.html')).toEqual([]);
    // Old metadata is gone: re-importing it requires a fresh updateHTMLFile
    registry.registerImports('file:///q.eligian', 'file:///a.html');
    expect(registry.getHTMLForDocument('file:///q.eligian')).toBeUndefined();
  });

  test('retargeting keeps the old layout while another document still imports it', () => {
    const registry = new HTMLRegistryService();
    registry.updateHTMLFile('file:///a.html', meta('a'));
    registry.registerImports('file:///p.eligian', 'file:///a.html');
    registry.registerImports('file:///q.eligian', 'file:///a.html');
    registry.updateHTMLFile('file:///b.html', meta('b'));
    registry.registerImports('file:///p.eligian', 'file:///b.html');

    expect(registry.getHTMLForDocument('file:///q.eligian')?.content).toBe('a');
  });

  test('clearDocument removes the mapping and the orphaned layout metadata', () => {
    const registry = new HTMLRegistryService();
    registry.updateHTMLFile('file:///a.html', meta('a'));
    registry.registerImports('file:///p.eligian', 'file:///a.html');

    registry.clearDocument('file:///p.eligian');

    expect(registry.hasImport('file:///p.eligian')).toBe(false);
    expect(registry.getHTMLForDocument('file:///p.eligian')).toBeUndefined();
    registry.registerImports('file:///p.eligian', 'file:///a.html');
    expect(registry.getHTMLForDocument('file:///p.eligian')).toBeUndefined();
  });

  test('clearDocument keeps layout metadata that another document uses', () => {
    const registry = new HTMLRegistryService();
    registry.updateHTMLFile('file:///a.html', meta('a'));
    registry.registerImports('file:///p.eligian', 'file:///a.html');
    registry.registerImports('file:///q.eligian', 'file:///a.html');

    registry.clearDocument('file:///p.eligian');

    expect(registry.getHTMLForDocument('file:///q.eligian')?.content).toBe('a');
  });
});
