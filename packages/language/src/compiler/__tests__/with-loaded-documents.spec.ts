/**
 * withLoadedDocuments: load files and their libraries into the shared workspace,
 * link them, load their CSS, run a callback, then release everything.
 *
 * Imported from the compiler barrel, which proves the root exports.
 */
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isProgram } from '../../generated/ast.js';
import { getOrCreateServices, withLoadedDocuments } from '../index.js';

const FIXTURES = path.join(__dirname, '__fixtures__', 'loaded-documents');
const main = path.join(FIXTURES, 'main.eligian');

const workspaceCount = () => getOrCreateServices().shared.workspace.LangiumDocuments.all.count();

describe('withLoadedDocuments', () => {
  it('loads the file and its libraries transitively', async () => {
    const [size, root] = await withLoadedDocuments([main], loaded => [
      loaded.documents.size,
      loaded.documentOf(main)!.parseResult.value,
    ]);

    expect(size).toBe(3);
    expect(isProgram(root)).toBe(true);
  });

  it('loads CSS imports into the registry', async () => {
    const classes = await withLoadedDocuments([main], loaded => {
      const uri = loaded.documentOf(main)!.uri.toString();
      return [...loaded.services.css.CSSRegistry.getClassesForDocument(uri)];
    });

    expect(classes).toContain('loaded-marker');
  });

  it('releases every document, also when use throws', async () => {
    const before = workspaceCount();

    await withLoadedDocuments([main], () => undefined);
    expect(workspaceCount()).toBe(before);

    await expect(
      withLoadedDocuments([main], () => {
        throw new Error('x');
      })
    ).rejects.toThrow('x');
    expect(workspaceCount()).toBe(before);
  });

  it('reports an unreadable file through onUnreadable', async () => {
    const missing = path.join(FIXTURES, 'missing.eligian');
    const onUnreadable = vi.fn();

    const size = await withLoadedDocuments(
      [missing],
      loaded => loaded.documents.size,
      onUnreadable
    );

    expect(size).toBe(0);
    expect(onUnreadable).toHaveBeenCalledTimes(1);
    expect(onUnreadable.mock.calls[0][0]).toBe(missing);
  });
});
