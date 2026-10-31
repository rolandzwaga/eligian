/**
 * Retargeted / removed one-to-one imports (audit medium #42)
 *
 * Switching `locales "./a.json"` to `"./b.json"` (or `layout`) used to send no
 * notification because the document already had an import, so the extension kept
 * watching the old file. Removing the import was never announced either.
 */

import type { Program } from '@eligian/language';
import { beforeEach, describe, expect, type Mock, test, vi } from 'vitest';
import type { ImportProcessorConfig } from '../import-processor.js';
import { processImports } from '../import-processor.js';

/** The default-import node type (`styles`, `locales`, ...); not exported by the package index. */
type DefaultImport = Extract<Program['statements'][number], { $type: 'DefaultImport' }>;

function program(imports: Array<{ type: string; path: string }>): Program {
  return {
    $type: 'Program',
    statements: imports.map(i => ({
      $type: 'DefaultImport',
      type: i.type,
      path: `"${i.path}"`,
    })) as DefaultImport[],
  } as Program;
}

/** A tiny in-memory one-to-one registry mirroring Label/HTMLRegistry. */
function oneRegistry() {
  const byDoc = new Map<string, string>();
  return {
    byDoc,
    registry: {
      updateFile: vi.fn(),
      registerImports: (doc: string, file: string | string[]) => byDoc.set(doc, file as string),
      hasImport: (doc: string) => byDoc.has(doc),
      getImports: (doc: string) => (byDoc.has(doc) ? [byDoc.get(doc) as string] : []),
      clearImports: (doc: string) => byDoc.delete(doc),
    },
  };
}

function oneConfig(
  importType: 'locales' | 'layout',
  registry: ReturnType<typeof oneRegistry>['registry']
): ImportProcessorConfig<string> {
  return {
    importType,
    parseFile: c => c,
    createEmptyMetadata: () => '',
    registry,
    notification: {
      type: 'test/imports',
      createParams: (documentUri, fileUri) => ({ documentUri, fileUri }),
    },
    cardinality: 'one',
  };
}

describe('processImports: one-to-one retargeting', () => {
  const docUri = 'file:///proj/doc.eligian';
  const docDir = '/proj/__nonexistent__';
  let connection: { sendNotification: Mock<(type: string, params: unknown) => void> };

  beforeEach(() => {
    connection = { sendNotification: vi.fn<(type: string, params: unknown) => void>() };
  });

  test.each(['locales', 'layout'] as const)('notifies when a %s import is retargeted', type => {
    const { registry } = oneRegistry();
    const config = oneConfig(type, registry);

    processImports(docUri, program([{ type, path: './a.x' }]), docDir, connection, config);
    expect(connection.sendNotification).toHaveBeenCalledTimes(1);
    const first = (connection.sendNotification.mock.calls[0][1] as { fileUri: string }).fileUri;
    expect(first).toContain('a.x');

    // Unchanged re-pass: loop prevention, no notification.
    processImports(docUri, program([{ type, path: './a.x' }]), docDir, connection, config);
    expect(connection.sendNotification).toHaveBeenCalledTimes(1);

    // Retarget: notification with the NEW file.
    processImports(docUri, program([{ type, path: './b.x' }]), docDir, connection, config);
    expect(connection.sendNotification).toHaveBeenCalledTimes(2);
    expect((connection.sendNotification.mock.calls[1][1] as { fileUri: string }).fileUri).toContain(
      'b.x'
    );
  });

  test('announces removal with an empty URI and clears the registration', () => {
    const { registry, byDoc } = oneRegistry();
    const config = oneConfig('locales', registry);

    processImports(
      docUri,
      program([{ type: 'locales', path: './a.json' }]),
      docDir,
      connection,
      config
    );
    connection.sendNotification.mockClear();

    processImports(docUri, program([]), docDir, connection, config);

    expect(connection.sendNotification).toHaveBeenCalledTimes(1);
    expect(connection.sendNotification.mock.calls[0][1]).toEqual({
      documentUri: docUri,
      fileUri: '',
    });
    expect(byDoc.has(docUri)).toBe(false);

    // Already removed: nothing more to announce.
    processImports(docUri, program([]), docDir, connection, config);
    expect(connection.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('documents that never had an import send nothing', () => {
    const { registry } = oneRegistry();
    processImports(docUri, program([]), docDir, connection, oneConfig('layout', registry));
    expect(connection.sendNotification).not.toHaveBeenCalled();
  });

  test('only matches the grammar keyword "locales", not "labels"', () => {
    const { registry } = oneRegistry();
    processImports(
      docUri,
      program([{ type: 'labels', path: './a.json' }]),
      docDir,
      connection,
      oneConfig('locales', registry)
    );
    expect(connection.sendNotification).not.toHaveBeenCalled();
  });
});

describe('processImports: one-to-many removal', () => {
  test('sends an empty list when the last styles import is removed', () => {
    const connection = { sendNotification: vi.fn<(type: string, params: unknown) => void>() };
    const store = new Map<string, string[]>();
    const config: ImportProcessorConfig<string> = {
      importType: 'styles',
      parseFile: c => c,
      createEmptyMetadata: () => '',
      registry: {
        updateFile: vi.fn(),
        registerImports: (doc, files) => store.set(doc, files as string[]),
        getImports: doc => store.get(doc) ?? [],
      },
      notification: {
        type: 'test/css',
        createParams: (documentUri, fileUris) => ({ documentUri, fileUris }),
      },
      cardinality: 'many',
    };
    const doc = 'file:///proj/doc.eligian';

    processImports(
      doc,
      program([{ type: 'styles', path: './a.css' }]),
      '/proj/__x__',
      connection,
      config
    );
    expect(connection.sendNotification).toHaveBeenCalledTimes(1);

    processImports(doc, program([]), '/proj/__x__', connection, config);
    expect(connection.sendNotification).toHaveBeenCalledTimes(2);
    expect(
      (connection.sendNotification.mock.calls[1][1] as { fileUris: string[] }).fileUris
    ).toEqual([]);
    expect(store.get(doc)).toEqual([]);

    processImports(doc, program([]), '/proj/__x__', connection, config);
    expect(connection.sendNotification).toHaveBeenCalledTimes(2);
  });
});
