/**
 * Spec 059 Phase 1 (plan P19): a parser defect reaches the tool boundary. `brief-file.js` is
 * replaced by a pass-through whose `parseBrief` throws only on a text holding the sentinel; the
 * module mock lives in its own spec so it never touches `brief-tool.spec.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

const SENTINEL = 'PARSE-DEFECT-SENTINEL';

vi.mock('../mcp/brief/brief-file.js', async importOriginal => {
  const original = await importOriginal<typeof import('../mcp/brief/brief-file.js')>();
  return {
    ...original,
    parseBrief: (text: string, ...rest: unknown[]) => {
      if (text.includes(SENTINEL)) throw new Error(`${SENTINEL}: the parser broke`);
      return (original.parseBrief as (...args: unknown[]) => unknown)(text, ...rest);
    },
  };
});

const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');

describe('parse defect (P19)', () => {
  let root: string;
  let server: InMemoryServer;

  beforeEach(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-brief-')));
    server = await startInMemoryServer({ cwd: root, docsRoot: DOCS });
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('a parseBrief that throws gives kind internal, BRIEF.md bytes unchanged, console.error got the defect', async () => {
    const file = path.join(root, 'BRIEF.md');
    const created = await server.callTool('eligian_brief', {
      action: 'answer',
      idea: 'An idea',
      answers: [{ id: 'P4', value: 'plain' }],
    });
    expect(created.isError).toBe(false);
    fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}\n## Notes\n\n${SENTINEL}\n`);
    const bytes = fs.readFileSync(file);

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await server.callTool('eligian_brief', {
        action: 'answer',
        answers: [{ id: 'P1', value: 'Know the hours.' }],
      });

      const raw = result.raw as { content: { text: string }[] };
      expect(result.isError).toBe(true);
      expect(raw.content[0].text.startsWith('{"header":')).toBe(true);
      expect(result.payload.error.kind).toBe('internal');
      expect(result.payload.error.message).toContain(SENTINEL);
      expect(fs.readFileSync(file).equals(bytes)).toBe(true);

      const logged = error.mock.calls
        .map(args => args.map(arg => (arg instanceof Error ? arg.stack : String(arg))).join(' '))
        .join('\n');
      expect(logged).toContain(SENTINEL);
      expect(log).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      log.mockRestore();
    }
  });
});
