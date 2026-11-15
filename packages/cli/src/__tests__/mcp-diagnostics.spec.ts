/**
 * Spec 058 Phase 1 (FR-015; plan C6): `eligian_check`'s diagnostics. Every
 * `CheckDiagnostic` becomes an `McpDiagnostic` with its source stage, the
 * source excerpt of its range, the suggestions / quick fix of its `data`, and
 * its overlay: the docs id on every diagnostic, the fix text on the first of
 * each code only.
 */
import * as path from 'node:path';
import type { CheckDiagnostic, CheckFileResult } from '@eligian/language';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  excerptOf,
  McpDiagnosticSchema,
  smokeToMcpDiagnostics,
  sourceOf,
  toMcpDiagnostics,
} from '../mcp/diagnostics.js';
import type { Overlays } from '../mcp/knowledge/types.js';
import { SMOKE_CODES, type SmokeProblem } from '../smoke/smoke-runner.js';

const FILE = path.resolve('project', 'main.eligian');

const SOURCE = [
  'styles "./main.css"',
  'timeline "t" in "#app" using raf {',
  '  at 0s..1s [ ] [ addClass("x") ]',
  '  at 1s..2s fadeIn("#box")',
  '  at 2s..3s fadeOut("#box")',
  '}',
].join('\r\n');

function diagnostic(overrides: Partial<CheckDiagnostic> & { code: string }): CheckDiagnostic {
  return {
    file: FILE,
    severity: 'error',
    message: `problem ${overrides.code}`,
    line: 3,
    column: 3,
    endLine: 3,
    endColumn: 10,
    ...overrides,
  };
}

const OVERLAYS: Overlays = {
  byCode: {
    'missing-dependency': {
      docs: 'diagnostic/missing-dependency',
      fix: 'Select an element first.',
    },
  },
  bySource: {
    validator: { docs: 'diagnostic/validator', fix: 'Read the validator message.' },
    'eligius-lint': { docs: 'diagnostic/eligius-lint', fix: 'Read the lint rule.' },
  },
};

const results = (...diagnostics: CheckDiagnostic[]): CheckFileResult[] => [
  { file: FILE, diagnostics },
];

const readSource = () => SOURCE;

describe('sourceOf', () => {
  it('registry codes use DIAGNOSTIC_CODES', () => {
    expect(sourceOf('missing-dependency')).toBe('validator');
    expect(sourceOf('syntax-error')).toBe('parser');
    expect(sourceOf('unresolved-reference')).toBe('linker');
    expect(sourceOf('type-mismatch')).toBe('type');
    expect(sourceOf('file-unreadable')).toBe('compiler');
  });

  it('CLI-layer codes', () => {
    expect(sourceOf('eligius-W150')).toBe('eligius-lint');
    expect(sourceOf('eligius-E101')).toBe('eligius-lint');
    expect(sourceOf('compile-failed')).toBe('compiler');
    expect(sourceOf('controller-imbalance')).toBe('review');
    expect(sourceOf('class-never-removed')).toBe('review');
  });

  it('sourceOf maps every SMOKE_CODES code to smoke', () => {
    for (const code of SMOKE_CODES) expect(sourceOf(code)).toBe('smoke');
    // Checked before the validator fallback; a validator code stays validator
    expect(sourceOf('missing-dependency')).toBe('validator');
    expect(sourceOf('uncoded')).toBe('validator');
  });

  it('unknown codes fall back to validator', () => {
    expect(sourceOf('uncoded')).toBe('validator');
    expect(sourceOf('no-such-code')).toBe('validator');
  });
});

describe('excerptOf', () => {
  it('CRLF safe, at most 3 lines', () => {
    expect(excerptOf(SOURCE, 3, 3)).toBe('  at 0s..1s [ ] [ addClass("x") ]');
    expect(excerptOf(SOURCE, 3, 4)).toBe(
      '  at 0s..1s [ ] [ addClass("x") ]\n  at 1s..2s fadeIn("#box")'
    );
    // A six-line range is cut to its first three lines
    expect(excerptOf(SOURCE, 1, 6)).toBe(
      'styles "./main.css"\ntimeline "t" in "#app" using raf {\n  at 0s..1s [ ] [ addClass("x") ]'
    );
    expect(excerptOf(SOURCE, 1, 6)).not.toContain('\r');
    // An end before the start is the start line only
    expect(excerptOf(SOURCE, 2, 1)).toBe('timeline "t" in "#app" using raf {');
    // Past the end of the file
    expect(excerptOf(SOURCE, 6, 9)).toBe('}');
  });
});

describe('toMcpDiagnostics', () => {
  it('fix only on the first diagnostic of a code', () => {
    const [first, second] = toMcpDiagnostics(
      results(
        diagnostic({ code: 'missing-dependency' }),
        diagnostic({ code: 'missing-dependency', line: 4, endLine: 4 })
      ),
      OVERLAYS,
      readSource
    );
    expect(first.docs).toBe('diagnostic/missing-dependency');
    expect(first.fix).toBe('Select an element first.');
    expect(second.docs).toBe('diagnostic/missing-dependency');
    expect(second).not.toHaveProperty('fix');
  });

  it('generic overlay of the source when the code has none', () => {
    const [unknown, lint, review] = toMcpDiagnostics(
      results(
        diagnostic({ code: 'unknown_operation' }),
        diagnostic({ code: 'eligius-W150', severity: 'warning' }),
        diagnostic({ code: 'controller-imbalance', severity: 'warning' })
      ),
      OVERLAYS,
      readSource
    );
    expect(unknown.source).toBe('validator');
    expect(unknown.docs).toBe('diagnostic/validator');
    expect(unknown.fix).toBe('Read the validator message.');
    expect(lint.source).toBe('eligius-lint');
    expect(lint.docs).toBe('diagnostic/eligius-lint');
    expect(lint.fix).toBe('Read the lint rule.');
    // No overlay for the code nor its source: neither docs nor fix
    expect(review.source).toBe('review');
    expect(review).not.toHaveProperty('docs');
    expect(review).not.toHaveProperty('fix');
  });

  it('suggestions and quickFix lifted from data', () => {
    const quickFix = {
      line: 3,
      column: 19,
      endLine: 3,
      endColumn: 19,
      newText: 'selectElement("#x") ',
    };
    const [withData, without] = toMcpDiagnostics(
      results(
        diagnostic({ code: 'missing-dependency', data: { suggestions: ['addClass'], quickFix } }),
        diagnostic({ code: 'unknown_operation' })
      ),
      OVERLAYS,
      readSource
    );
    expect(withData.suggestions).toEqual(['addClass']);
    expect(withData.quickFix).toEqual(quickFix);
    expect(withData).not.toHaveProperty('data');
    expect(without).not.toHaveProperty('suggestions');
    expect(without).not.toHaveProperty('quickFix');
  });

  it('absolute file, excerpt present', () => {
    const [mcp] = toMcpDiagnostics(
      results(diagnostic({ code: 'missing-dependency', line: 3, endLine: 4 })),
      { byCode: {}, bySource: {} },
      readSource
    );
    expect(path.isAbsolute(mcp.file)).toBe(true);
    expect(mcp.file).toBe(FILE);
    expect(mcp.excerpt).toBe('  at 0s..1s [ ] [ addClass("x") ]\n  at 1s..2s fadeIn("#box")');
    expect(mcp).toMatchObject({
      source: 'validator',
      severity: 'error',
      code: 'missing-dependency',
      message: 'problem missing-dependency',
      line: 3,
      column: 3,
      endLine: 4,
      endColumn: 10,
    });
  });

  it('reads each file once and keeps file order', () => {
    const other = path.resolve('project', 'other.eligian');
    const reads: string[] = [];
    const out = toMcpDiagnostics(
      [
        { file: FILE, diagnostics: [diagnostic({ code: 'a' }), diagnostic({ code: 'b' })] },
        { file: other, diagnostics: [diagnostic({ file: other, code: 'c', line: 1, endLine: 1 })] },
      ],
      { byCode: {}, bySource: {} },
      file => {
        reads.push(file);
        return file === other ? 'only line' : SOURCE;
      }
    );
    expect(out.map(d => d.code)).toEqual(['a', 'b', 'c']);
    expect(reads).toEqual([FILE, other]);
    expect(out[2].excerpt).toBe('only line');
  });

  it('an unreadable file gets an empty excerpt', () => {
    const [mcp] = toMcpDiagnostics(
      results(diagnostic({ code: 'a' })),
      { byCode: {}, bySource: {} },
      () => {
        throw new Error('ENOENT');
      }
    );
    expect(mcp.excerpt).toBe('');
  });

  it('a relative file is made absolute', () => {
    const [mcp] = toMcpDiagnostics(
      [{ file: FILE, diagnostics: [diagnostic({ code: 'a', file: 'rel/x.eligian' })] }],
      { byCode: {}, bySource: {} },
      readSource
    );
    expect(mcp.file).toBe(path.resolve('rel/x.eligian'));
  });
});

/** Spec 058 Phase 2 (FR-045; plan D5): the `smoke` source and the step fields. */
describe('smokeToMcpDiagnostics', () => {
  const problem = (
    overrides: Partial<SmokeProblem> & Pick<SmokeProblem, 'code'>
  ): SmokeProblem & { file: string } => ({
    file: FILE,
    severity: 'error',
    message: `smoke ${overrides.code}`,
    ...overrides,
  });

  it('smokeToMcpDiagnostics anchors a location-less problem at 1:1 of its file', () => {
    const [located, unlocated] = smokeToMcpDiagnostics(
      [
        problem({ code: 'smoke-engine-error', location: { file: FILE, line: 4, column: 12 } }),
        problem({ code: 'smoke-run-failed' }),
      ],
      { byCode: {}, bySource: {} },
      readSource
    );
    expect(located).toMatchObject({
      source: 'smoke',
      severity: 'error',
      code: 'smoke-engine-error',
      message: 'smoke smoke-engine-error',
      file: FILE,
      line: 4,
      column: 12,
      excerpt: '  at 1s..2s fadeIn("#box")',
    });
    expect(unlocated).toMatchObject({
      source: 'smoke',
      code: 'smoke-run-failed',
      file: FILE,
      line: 1,
      column: 1,
      excerpt: 'styles "./main.css"',
    });
  });

  it('carries timeline, time, step, expected, actual', () => {
    const [assertion, plain] = smokeToMcpDiagnostics(
      [
        problem({
          code: 'scenario-assertion-failed',
          timeline: 't',
          time: 1.5,
          step: 2,
          expected: '"visible"',
          actual: '"hidden"',
        }),
        problem({ code: 'smoke-console-warn', severity: 'warning' }),
      ],
      { byCode: {}, bySource: {} },
      readSource
    );
    expect(assertion).toMatchObject({
      timeline: 't',
      time: 1.5,
      step: 2,
      expected: '"visible"',
      actual: '"hidden"',
    });
    expect(plain.severity).toBe('warning');
    for (const key of ['timeline', 'time', 'step', 'expected', 'actual']) {
      expect(plain).not.toHaveProperty(key);
    }
  });

  it('keeps problem order across files and uses the overlays', () => {
    const lib = path.resolve('project', 'lib.eligian');
    const reads: string[] = [];
    const out = smokeToMcpDiagnostics(
      [
        problem({ code: 'smoke-engine-error', location: { file: lib, line: 1, column: 1 } }),
        problem({ code: 'smoke-console-error', step: 0 }),
        problem({
          code: 'smoke-engine-error',
          location: { file: lib, line: 1, column: 1 },
          step: 1,
        }),
      ],
      {
        byCode: {},
        bySource: { smoke: { docs: 'diagnostic/smoke', fix: 'Read the smoke message.' } },
      },
      file => {
        reads.push(file);
        return file === lib ? 'library line' : SOURCE;
      }
    );
    expect(out.map(d => [d.code, d.file, d.step])).toEqual([
      ['smoke-engine-error', lib, undefined],
      ['smoke-console-error', FILE, 0],
      ['smoke-engine-error', lib, 1],
    ]);
    expect(out[0].excerpt).toBe('library line');
    expect(out[1].excerpt).toBe('styles "./main.css"');
    expect(reads).toEqual([lib, FILE]);
    expect(out.every(d => d.docs === 'diagnostic/smoke')).toBe(true);
    expect(out[0].fix).toBe('Read the smoke message.');
    expect(out[1].fix).toBe('Read the smoke message.');
    expect(out[2]).not.toHaveProperty('fix');
  });

  it('the schema decodes the new fields', () => {
    const [mcp] = smokeToMcpDiagnostics(
      [
        problem({
          code: 'scenario-assertion-failed',
          timeline: 't',
          time: 0.25,
          step: 3,
          expected: '1',
          actual: '2',
        }),
      ],
      { byCode: {}, bySource: {} },
      readSource
    );
    const decode = Schema.decodeUnknownSync(McpDiagnosticSchema);
    expect(decode(mcp)).toMatchObject({
      source: 'smoke',
      timeline: 't',
      time: 0.25,
      step: 3,
      expected: '1',
      actual: '2',
    });
    expect(() => decode({ ...mcp, step: 1.5 })).toThrow();
  });
});
