/**
 * Spec 058 Phase 0 (SC-004, SC-017, SC-019): every diagnostic `eligian check --format json`
 * prints carries a code from the diagnostic-code registry exported by `@eligian/language`.
 * Runs the built CLI (bin/cli.js) on the probe fixtures in __fixtures__/check-codes/.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { DIAGNOSTIC_CODES, isDiagnosticCode } from '@eligian/language';
import { describe, expect, it } from 'vitest';

const bin = path.join(__dirname, '../../bin/cli.js');
const FIXTURES = path.join(__dirname, '__fixtures__/check-codes');

interface JsonDiagnostic {
  readonly severity: string;
  readonly message: string;
  readonly code?: string;
}

interface JsonReport {
  readonly files: readonly { readonly diagnostics: readonly JsonDiagnostic[] }[];
}

/** Runs `check <fixture> --format json`; a non-zero exit (errors found) still prints the report. */
function check(fixture: string): readonly JsonDiagnostic[] {
  const file = path.join(FIXTURES, fixture);
  let stdout: string;
  try {
    stdout = execFileSync(process.execPath, [bin, 'check', file, '--format', 'json'], {
      encoding: 'utf-8',
    });
  } catch (error) {
    stdout = String((error as { stdout?: string }).stdout ?? '');
  }
  const report = JSON.parse(stdout) as JsonReport;
  return report.files.flatMap(f => f.diagnostics);
}

const FIXTURE_FILES = [
  'duplicate-styles.eligian',
  'video-without-from.eligian',
  'unknown-label.eligian',
  'stray-token.eligian',
] as const;

describe('eligian check --format json codes', () => {
  it('duplicate styles → import-duplicate-default', () => {
    const diagnostics = check('duplicate-styles.eligian');
    const duplicate = diagnostics.filter(d => d.message.includes("Duplicate 'styles' import"));
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].code).toBe('import-duplicate-default');
  });

  it('video without from → one coded diagnostic, no Typir prefix', () => {
    const diagnostics = check('video-without-from.eligian');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('timeline-source-required');
    expect(diagnostics.filter(d => d.message.startsWith('While validating the AstNode'))).toEqual(
      []
    );
  });

  it('undeclared label → unresolved-reference', () => {
    const diagnostics = check('unknown-label.eligian');
    const unresolved = diagnostics.filter(d => d.message.includes("named 'nope'"));
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].code).toBe('unresolved-reference');
  });

  it('stray token → syntax-error', () => {
    const diagnostics = check('stray-token.eligian');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.filter(d => d.code === 'syntax-error')).toHaveLength(1);
  });

  it('every printed code is a registry code, compile-failed or eligius-*', () => {
    const outputs = FIXTURE_FILES.map(f => ({ fixture: f, diagnostics: check(f) }));
    for (const { fixture, diagnostics } of outputs) {
      expect(diagnostics.length, fixture).toBeGreaterThan(0);
      for (const d of diagnostics) {
        expect(d.code, `${fixture}: ${d.message}`).toBeDefined();
        const code = d.code ?? '';
        expect(
          isDiagnosticCode(code) || code === 'compile-failed' || code.startsWith('eligius-'),
          `${fixture}: '${code}' is not a registry code`
        ).toBe(true);
      }
    }
  });

  it('@eligian/language exposes the registry', () => {
    expect(DIAGNOSTIC_CODES.length).toBeGreaterThan(0);
    expect(isDiagnosticCode('syntax-error')).toBe(true);
    expect(isDiagnosticCode('not-a-registered-code')).toBe(false);
  });
});
