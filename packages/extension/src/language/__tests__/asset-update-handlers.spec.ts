/**
 * Hot-reload handlers (audit low #51, #58)
 *
 * Labels hot-reload with invalid JSON used to do nothing: the registry kept the old keys and
 * the importing documents were never revalidated, so no diagnostic appeared until the next edit.
 */
import { describe, expect, test, vi } from 'vitest';
import { createAssetUpdateHandlers } from '../asset-update-handlers.js';
import { ImportParseCache } from '../import-cache.js';

const LABELS_URI = 'file:///proj/en-US.json';
const DOCS = ['file:///proj/doc.eligian'];

function setup(files: Record<string, string>) {
  const cssRegistry = {
    updateCSSFile: vi.fn(),
    getFilesImporting: vi.fn((_uri: string): string[] => []),
  };
  const labelRegistry = { updateLabelsFile: vi.fn() };
  const htmlRegistry = { updateHTMLFile: vi.fn() };
  const triggerRevalidation = vi.fn();
  const caches = {
    css: new ImportParseCache<unknown>(),
    labels: new ImportParseCache<unknown>(),
    html: new ImportParseCache<unknown>(),
  };
  const readFile = vi.fn((filePath: string) => {
    const key = filePath.replace(/\\/g, '/');
    const hit = Object.entries(files).find(([name]) => key.endsWith(name));
    if (!hit) {
      throw new Error(`ENOENT: ${filePath}`);
    }
    return hit[1];
  });
  const handlers = createAssetUpdateHandlers({
    cssRegistry: cssRegistry as any,
    labelRegistry: labelRegistry as any,
    htmlRegistry: htmlRegistry as any,
    triggerRevalidation,
    caches,
    readFile,
  });
  return { handlers, cssRegistry, labelRegistry, htmlRegistry, triggerRevalidation, caches };
}

describe('onLabelsUpdated', () => {
  test('valid file: registers the keys and revalidates', () => {
    const { handlers, labelRegistry, triggerRevalidation } = setup({
      'en-US.json': JSON.stringify({ 'en-US': { greeting: 'Hi' } }),
    });

    handlers.onLabelsUpdated({ labelsFileUri: LABELS_URI, documentUris: DOCS });

    expect(labelRegistry.updateLabelsFile).toHaveBeenCalledTimes(1);
    expect(labelRegistry.updateLabelsFile.mock.calls[0][1]).toEqual([
      expect.objectContaining({ id: 'greeting' }),
    ]);
    expect(triggerRevalidation).toHaveBeenCalledWith(DOCS);
  });

  test('syntactically invalid JSON (trailing comma): clears the registry and revalidates', () => {
    const { handlers, labelRegistry, triggerRevalidation } = setup({
      'en-US.json': '{ "en-US": { "greeting": "Hi", } }',
    });

    handlers.onLabelsUpdated({ labelsFileUri: LABELS_URI, documentUris: DOCS });

    expect(labelRegistry.updateLabelsFile).toHaveBeenCalledWith(LABELS_URI, []);
    expect(triggerRevalidation).toHaveBeenCalledWith(DOCS);
  });

  test('schema-invalid JSON: clears the registry and revalidates', () => {
    const { handlers, labelRegistry, triggerRevalidation } = setup({
      'en-US.json': JSON.stringify({ 'en-US': { count: 3 } }),
    });

    handlers.onLabelsUpdated({ labelsFileUri: LABELS_URI, documentUris: DOCS });

    expect(labelRegistry.updateLabelsFile).toHaveBeenCalledWith(LABELS_URI, []);
    expect(triggerRevalidation).toHaveBeenCalledWith(DOCS);
  });

  test('deleted file: clears the registry and revalidates', () => {
    const { handlers, labelRegistry, triggerRevalidation } = setup({});

    handlers.onLabelsUpdated({ labelsFileUri: LABELS_URI, documentUris: DOCS });

    expect(labelRegistry.updateLabelsFile).toHaveBeenCalledWith(LABELS_URI, []);
    expect(triggerRevalidation).toHaveBeenCalledWith(DOCS);
  });

  test('drops the parse-cache entry of the refreshed file', () => {
    const { handlers, caches } = setup({ 'en-US.json': '{}' });
    const invalidate = vi.spyOn(caches.labels, 'invalidate');

    handlers.onLabelsUpdated({ labelsFileUri: LABELS_URI, documentUris: DOCS });

    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});

describe('onHtmlUpdated', () => {
  test('registers the content and revalidates', () => {
    const { handlers, htmlRegistry, triggerRevalidation } = setup({ 'layout.html': '<div/>' });

    handlers.onHtmlUpdated({ htmlFileUri: 'file:///proj/layout.html', documentUris: DOCS });

    expect(htmlRegistry.updateHTMLFile).toHaveBeenCalledWith('file:///proj/layout.html', {
      content: '<div/>',
      errors: [],
    });
    expect(triggerRevalidation).toHaveBeenCalledWith(DOCS);
  });

  test('missing file: registers an error and revalidates', () => {
    const { handlers, htmlRegistry, triggerRevalidation } = setup({});

    handlers.onHtmlUpdated({ htmlFileUri: 'file:///proj/layout.html', documentUris: DOCS });

    const metadata = htmlRegistry.updateHTMLFile.mock.calls[0][1];
    expect(metadata.content).toBe('');
    expect(metadata.errors).toHaveLength(1);
    expect(triggerRevalidation).toHaveBeenCalledWith(DOCS);
  });
});

describe('onCssUpdated', () => {
  test('re-parses the sheet, re-parses its @import importers and revalidates', () => {
    const { handlers, cssRegistry, triggerRevalidation } = setup({
      'base.css': '.a { color: red }',
      'theme.css': '@import "./base.css"; .b { color: blue }',
    });
    cssRegistry.getFilesImporting.mockReturnValue(['file:///proj/theme.css']);

    handlers.onCssUpdated({ cssFileUri: 'file:///proj/base.css', documentUris: DOCS });

    const updated = cssRegistry.updateCSSFile.mock.calls.map(c => c[0]);
    expect(updated).toEqual(['file:///proj/base.css', 'file:///proj/theme.css']);
    expect(triggerRevalidation).toHaveBeenCalledWith(DOCS);
  });

  test('clears the whole CSS parse cache (importers merge the changed sheet)', () => {
    const { handlers, caches } = setup({ 'base.css': '.a {}' });
    const clear = vi.spyOn(caches.css, 'clear');

    handlers.onCssUpdated({ cssFileUri: 'file:///proj/base.css', documentUris: DOCS });

    expect(clear).toHaveBeenCalledTimes(1);
  });

  test('missing file: registers error metadata and revalidates', () => {
    const { handlers, cssRegistry, triggerRevalidation } = setup({});

    handlers.onCssUpdated({ cssFileUri: 'file:///proj/gone.css', documentUris: DOCS });

    expect(cssRegistry.updateCSSFile).toHaveBeenCalledTimes(1);
    expect(triggerRevalidation).toHaveBeenCalledWith(DOCS);
  });
});

describe('onCssError', () => {
  test('stores error metadata for the file', () => {
    const { handlers, cssRegistry } = setup({});

    handlers.onCssError({
      cssFileUri: 'file:///proj/bad.css',
      errors: [{ message: 'oops', filePath: 'bad.css', line: 1, column: 1 }],
    } as any);

    expect(cssRegistry.updateCSSFile).toHaveBeenCalledTimes(1);
    expect(cssRegistry.updateCSSFile.mock.calls[0][0]).toBe('file:///proj/bad.css');
  });
});
