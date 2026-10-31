import type { Program } from '@eligian/language';
import { describe, expect, test, vi } from 'vitest';
import type { ImportProcessorConfig } from '../import-processor.js';
import { processImports } from '../import-processor.js';

/** Audit finding #31: named CSS imports must be processed like `styles` imports. */
describe('processImports with includeNamedCssImports', () => {
  const program = {
    $type: 'Program',
    statements: [
      { $type: 'DefaultImport', type: 'styles', path: '"./main.css"' },
      { $type: 'NamedImport', name: 'theme', path: '"./theme.css"' },
      { $type: 'NamedImport', name: 'other', path: '"./other.dat"', assetType: 'css' },
      { $type: 'NamedImport', name: 'page', path: '"./page.html"' },
    ],
  } as unknown as Program;

  const run = (includeNamedCssImports: boolean) => {
    const registry = { updateFile: vi.fn(), registerImports: vi.fn() };
    const config: ImportProcessorConfig<{ n: number }> = {
      importType: 'styles',
      includeNamedCssImports,
      parseFile: () => ({ n: 1 }),
      createEmptyMetadata: () => ({ n: 0 }),
      registry,
      notification: { type: 'x', createParams: (d, f) => ({ d, f }) },
      cardinality: 'many',
    };
    processImports(
      'file:///test/doc.eligian',
      program,
      '/test',
      { sendNotification: vi.fn() },
      config
    );
    return registry.registerImports.mock.calls[0][1] as string[];
  };

  test('registers default styles and CSS named imports only', () => {
    const uris = run(true);
    expect(uris).toHaveLength(3);
    expect(uris.some(u => u.endsWith('main.css'))).toBe(true);
    expect(uris.some(u => u.endsWith('theme.css'))).toBe(true);
    expect(uris.some(u => u.endsWith('other.dat'))).toBe(true);
    expect(uris.some(u => u.endsWith('page.html'))).toBe(false);
  });

  test('keeps legacy behaviour when the flag is off', () => {
    expect(run(false)).toHaveLength(1);
  });
});
