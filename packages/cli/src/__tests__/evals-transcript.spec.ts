/**
 * Spec 058 Phase 3 (FR-005, FR-007, FR-008; plan D3, P13; tasks D2): the transcript, its tool
 * entries and the run metrics of the eval harness, over recorded `claude -p --output-format json`
 * transcripts and `ELIGIAN_MCP_LOG` telemetry logs (`__fixtures__/evals/`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Arm,
  computeMetrics,
  isCheckBashCall,
  isCliBashCall,
  parseTranscript,
  readMcpLog,
  toolCalls,
  toolEntries,
} from '../mcp/evals/transcript.js';

const FIXTURES = path.join(__dirname, '__fixtures__', 'evals');

const transcript = (name: string): unknown[] =>
  parseTranscript(fs.readFileSync(path.join(FIXTURES, 'transcripts', `${name}.json`), 'utf8'));
const log = (name: string) => readMcpLog(path.join(FIXTURES, 'logs', `${name}.log`));
const metrics = (arm: Arm, name: string, logName?: string) =>
  computeMetrics(arm, transcript(name), logName === undefined ? [] : log(logName));

describe('parseTranscript', () => {
  it('reads a JSON array, a single object, JSON lines and an empty text', () => {
    expect(parseTranscript('[{"type":"a"},{"type":"b"}]')).toEqual([{ type: 'a' }, { type: 'b' }]);
    expect(parseTranscript('{"type":"a"}')).toEqual([{ type: 'a' }]);
    expect(parseTranscript('{"type":"a"}\r\nnot json\n{"type":"b"}\n')).toEqual([
      { type: 'a' },
      { type: 'b' },
    ]);
    expect(parseTranscript('  \n')).toEqual([]);
  });
});

describe('toolEntries', () => {
  it('pairs each tool_use with its tool_result by tool_use_id', () => {
    const entries = toolEntries(transcript('pairing'));
    expect(entries.map(e => [e.id, e.name])).toEqual([
      ['toolu_p1', 'Read'],
      ['toolu_p2', 'mcp__eligian__eligian_docs'],
      ['toolu_p3', 'Glob'],
    ]);
    // toolu_p1's result arrives after toolu_p2's, in a later user event
    expect(entries[0]!.input).toEqual({ file_path: 'main.eligian' });
    expect(entries[0]!.resultText).toBe('line one\nline two');
    expect(entries[0]!.resultChars).toBe('line one\nline two'.length);
    // a call the run never answered
    expect(entries[2]!.resultText).toBeUndefined();
    expect(entries[2]!.resultChars).toBe(0);
  });

  it('sums array content text items', () => {
    const docs = toolEntries(transcript('pairing'))[1]!;
    // the image item has no text and adds nothing
    expect(docs.resultText).toBe('{"header":"docs"} (2 of 2)');
    expect(docs.resultChars).toBe('{"header":"docs"}'.length + ' (2 of 2)'.length);
  });

  // Spec 059 phase 3 (FR-032, P7)
  it('toolEntries marks is_error results', () => {
    const use = (id: string) => ({ type: 'tool_use', id, name: 'Read', input: {} });
    const events = [
      { type: 'assistant', message: { content: [use('t1'), use('t2'), use('t3')] } },
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'boom', is_error: true },
            { type: 'tool_result', tool_use_id: 't2', content: 'fine' },
            { type: 'tool_result', tool_use_id: 't3', content: 'fine', is_error: false },
          ],
        },
      },
    ];
    const [failed, ok, notError] = toolEntries(events);
    expect(failed!.isError).toBe(true);
    expect(failed!.resultText).toBe('boom');
    expect('isError' in ok!).toBe(false);
    expect('isError' in notError!).toBe(false);
  });
});

describe('toolCalls', () => {
  it('is the projection of toolEntries', () => {
    for (const name of ['pairing', 'us1-1', 'a0-read-and-check', 'cli-branch']) {
      const events = transcript(name);
      const entries = toolEntries(events);
      const calls = toolCalls(events);
      expect(calls).toHaveLength(entries.length);
      expect(calls).toEqual(entries.map(e => ({ name: e.name, input: e.input })));
    }
    expect(toolCalls(transcript('us1-1'))).toHaveLength(7);
  });
});

describe('isCheckBashCall / isCliBashCall', () => {
  const bash = (command: string) => ({ name: 'Bash', input: { command } });

  it('recognise the CLI by name or by bin/cli.js', () => {
    expect(isCheckBashCall(bash('npx eligian check main.eligian'))).toBe(true);
    expect(isCheckBashCall(bash('node node_modules/eligian/bin/cli.js check main.eligian'))).toBe(
      true
    );
    expect(isCheckBashCall(bash('"node_modules/.bin/eligian" check x.eligian'))).toBe(true);
    expect(isCheckBashCall(bash('npx eligian fmt --write main.eligian'))).toBe(false);
    expect(isCheckBashCall({ name: 'Read', input: { command: 'eligian check' } })).toBe(false);

    expect(isCliBashCall(bash('npx eligian fmt --write main.eligian'))).toBe(true);
    expect(isCliBashCall(bash('npx eligian smoke main.eligian --strict'))).toBe(true);
    expect(isCliBashCall(bash('node node_modules/eligian/bin/cli.js main.eligian -o out'))).toBe(
      true
    );
    expect(isCliBashCall(bash('npx eligian --help'))).toBe(true);
    expect(isCliBashCall(bash('npx eligian check main.eligian'))).toBe(true);
    expect(isCliBashCall(bash('ls'))).toBe(false);
    expect(isCliBashCall(bash('cat main.eligian | head'))).toBe(false);
    expect(isCliBashCall(bash('cat node_modules/eligian/dist/docs/index.json'))).toBe(false);
  });
});

describe('readMcpLog', () => {
  it('keeps the JSON lines and skips the rest', () => {
    const lines = log('mixed-rounds');
    expect(lines.map(l => l.tool)).toEqual(['eligian_docs', 'eligian_check', 'eligian_check']);
  });

  it('a missing log is empty', () => {
    expect(readMcpLog(path.join(FIXTURES, 'logs', 'absent.log'))).toEqual([]);
  });
});

describe('computeMetrics', () => {
  // SC-003 (I-11)
  it('operations called before the first unknown_operation → true, hitUnknown true', () => {
    const m = metrics('A1', 'us1-1', 'us1-1');
    expect(m.operationsBeforeFirstUnknown).toBe(true);
    expect(m.hitUnknown).toBe(true);
  });

  it('the diagnostic before any operations call → false', () => {
    const m = metrics('A1', 'diagnostic-first');
    expect(m.operationsBeforeFirstUnknown).toBe(false);
    expect(m.hitUnknown).toBe(true);
  });

  it('no such diagnostic, operations-index read before the first check → true, hitUnknown false', () => {
    const m = metrics('A1', 'index-read-first');
    expect(m.operationsBeforeFirstUnknown).toBe(true);
    expect(m.hitUnknown).toBe(false);
  });

  it('no such diagnostic, nothing read before the first check → false', () => {
    // eligian_operations is called, but only after the first (clean) check
    const m = metrics('A1', 'nothing-read');
    expect(m.operationsBeforeFirstUnknown).toBe(false);
    expect(m.hitUnknown).toBe(false);
  });

  it('the first unknown_operation from a Bash eligian check result (CLI branch)', () => {
    // a clean CLI check, then the index read, then a CLI check that reports unknown_operation:
    // the reference point is the third entry's result, not the first check
    const m = metrics('A0', 'cli-branch');
    expect(m.hitUnknown).toBe(true);
    expect(m.operationsBeforeFirstUnknown).toBe(true);
    expect(m.checkBashCalls).toBe(3);
    expect(m.checkToolCalls).toBe(0);
  });

  it('an eligian_docs query whose hits return operations-index → true', () => {
    const m = metrics('A1', 'docs-query-hit');
    expect(m.operationsBeforeFirstUnknown).toBe(true);
    expect(m.hitUnknown).toBe(true);
  });

  it('an ids request answered in unknown → false', () => {
    const m = metrics('A1', 'docs-ids-unknown');
    expect(m.operationsBeforeFirstUnknown).toBe(false);
    expect(m.hitUnknown).toBe(true);
  });

  it('a run that made no check uses the end of the run', () => {
    const events = transcript('index-read-first').slice(0, 3);
    const m = computeMetrics('A1', events, []);
    expect(m.hitUnknown).toBe(false);
    expect(m.operationsBeforeFirstUnknown).toBe(true);
    expect(computeMetrics('A1', [], []).operationsBeforeFirstUnknown).toBe(false);
  });

  // SC-002 / US1-4 (FR-005, FR-008)
  it('A0: Read of generated/operations-index.md and Bash eligian check → transcriptToolChars > 0, channelChars > 0, toolChars 0', () => {
    const events = transcript('a0-read-and-check');
    const m = computeMetrics('A0', events, []);
    expect(m.transcriptToolChars).toBeGreaterThan(0);
    expect(m.channelChars).toBeGreaterThan(0);
    expect(m.toolChars).toBe(0);

    const entries = toolEntries(events);
    const chars = (id: string) => entries.find(e => e.id === id)!.resultChars;
    expect(m.transcriptToolChars).toBe(entries.reduce((sum, e) => sum + e.resultChars, 0));
    // the docs Read (a Windows path), the docs Grep, the CLI check and fmt; not main.eligian, not ls
    expect(m.channelChars).toBe(
      chars('toolu_f1') + chars('toolu_f2') + chars('toolu_f5') + chars('toolu_f6')
    );
    expect(m.channelChars).toBeLessThan(m.transcriptToolChars);
    expect(m.operationsBeforeFirstUnknown).toBe(true);
    expect(m.hitUnknown).toBe(false);
    // A-none measures its channel the same way
    expect(computeMetrics('A-none', events, []).channelChars).toBe(m.channelChars);
  });

  it('A1: channelChars equals toolChars', () => {
    const m = metrics('A1', 'us1-1', 'us1-1');
    expect(m.toolChars).toBe(812 + 1450 + 210 + 2300 + 120);
    expect(m.channelChars).toBe(m.toolChars);
    expect(m.transcriptToolChars).toBeGreaterThan(0);
    expect(m.transcriptToolChars).not.toBe(m.toolChars);
  });

  it('explainCalled and fmtCalled', () => {
    const a1 = metrics('A1', 'us1-1', 'us1-1');
    expect(a1.explainCalled).toBe(true);
    expect(a1.fmtCalled).toBe(true);

    const a0 = metrics('A0', 'a0-read-and-check');
    expect(a0.explainCalled).toBe(false);
    expect(a0.fmtCalled).toBe(true); // the CLI fmt call

    const none = metrics('A1', 'nothing-read');
    expect(none.explainCalled).toBe(false);
    expect(none.fmtCalled).toBe(false);
  });

  it('rounds = check tool lines + CLI check calls − 1', () => {
    const m = metrics('A1', 'mixed-rounds', 'mixed-rounds');
    expect(m.checkToolCalls).toBe(2);
    expect(m.checkBashCalls).toBe(1);
    expect(m.rounds).toBe(2);
    expect(m.toolCalls).toBe(5);
    expect(m.toolChars).toBe(300 + 1450 + 210);

    expect(metrics('A0', 'cli-branch').rounds).toBe(2);
    expect(metrics('A1', 'us1-1', 'us1-1').rounds).toBe(1);
  });

  it('records the wall time when given', () => {
    expect(computeMetrics('A1', [], [], 1234).wallMs).toBe(1234);
    expect(computeMetrics('A1', [], []).wallMs).toBeUndefined();
  });
});
