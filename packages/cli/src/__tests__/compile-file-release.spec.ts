/**
 * `compileFile` leaves no document in the shared workspace (spec 058 phase 2, SC-004(4),
 * T015 ruling). A regression guard, green before and after the phase: the validation
 * rejection releases through `parseSource`'s `onError`, the clean path through
 * `acquireUseRelease`. The only leaking branch (`AssetError`) is unreachable for a file
 * on disk, since the validator reports every asset error first.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOrCreateServices } from '@eligian/language';
import { describe, expect, it } from 'vitest';
import { CompilationError, compileFile } from '../compile-file.js';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'mcp',
  'compile'
);
const REJECTED = path.join(FIXTURES, 'compile-rejected', 'main.eligian');
const CLEAN = path.join(FIXTURES, 'compile-clean', 'main.eligian');

const documentCount = () => getOrCreateServices().shared.workspace.LangiumDocuments.all.count();

describe('compileFile', () => {
  it('releases its libraries when validation rejects', async () => {
    const before = documentCount();
    await expect(compileFile(REJECTED)).rejects.toBeInstanceOf(CompilationError);
    expect(documentCount()).toBe(before);
  });

  it('a clean compile also leaves the count unchanged', async () => {
    const before = documentCount();
    const result = await compileFile(CLEAN);
    expect(result.config.timelines.length).toBeGreaterThan(0);
    expect(documentCount()).toBe(before);
  });
});
