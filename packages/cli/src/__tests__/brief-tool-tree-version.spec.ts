/**
 * Spec 059 Phase 1 (FR-018, tool half): the next write of an unconfirmed brief records the current
 * tree version. The tree module is replaced by a version-2 tree (`TREE` plus `P6`, `since: 2`, as
 * in `__fixtures__/mcp/brief/tree-v2.ts`, which cannot be imported here: it imports the mocked
 * module), so a `- tree: 1` file is older than the server's tree.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

vi.mock('../mcp/brief/tree.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../mcp/brief/tree.js')>();
  const p6: import('../mcp/brief/tree.js').Question = {
    id: 'P6',
    branch: 'P',
    title: 'Is there a call to action at the end?',
    ask: 'Is there a call to action at the end?',
    shape: { kind: 'text' },
    needs: [],
    reads: [],
    appliesWhen: actual.ALWAYS,
    when: 'always',
    docs: [],
    facts: [],
    since: 2,
  };
  const afterP5 = actual.TREE.findIndex(q => q.id === 'P5') + 1;
  return {
    ...actual,
    TREE_VERSION: 2,
    TREE: [...actual.TREE.slice(0, afterP5), p6, ...actual.TREE.slice(afterP5)],
  };
});

const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');

describe('eligian_brief tree version (FR-018)', () => {
  let root: string;
  let server: InMemoryServer;
  let file: string;

  beforeEach(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-brief-tree-')));
    file = path.join(root, 'BRIEF.md');
    server = await startInMemoryServer({ cwd: root, docsRoot: DOCS });
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const ok = async (args: Record<string, unknown>) => {
    const result = await server.callTool('eligian_brief', args);
    expect(result.isError, JSON.stringify(result.payload)).toBe(false);
    return result.payload;
  };

  const treeLine = () =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .find(line => line.startsWith('- tree: '));

  it('an unconfirmed brief written under version 1 records version 2 on the next write', async () => {
    await ok({ action: 'status', idea: 'A kiosk that shows the support hours.' });
    expect(treeLine()).toBe('- tree: 2');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- tree: 2', '- tree: 1'));

    // A call that writes nothing leaves the version line as it is (FR-028).
    const status = await ok({ action: 'status', max: 20 });
    expect(status.round.map((i: { id: string }) => i.id)).toContain('P6');
    expect(treeLine()).toBe('- tree: 1');

    const answered = await ok({ action: 'answer', answers: [{ id: 'C1', value: 'self-paced' }] });
    expect(answered.rejected).toEqual([]);
    expect(treeLine()).toBe('- tree: 2');
  });
});
