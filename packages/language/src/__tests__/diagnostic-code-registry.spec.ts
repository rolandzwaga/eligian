/**
 * Diagnostic code registry (spec 058, Phase 0: FR-001, FR-001a, FR-002, FR-002a; SC-003, SC-019, SC-020).
 *
 * The registry is exactly the codes a diagnostic could carry before Phase 0 (the enumerated
 * baseline, kept verbatim) plus the new kebab-case codes of plan A1.
 */

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MISSING_LABELS_FILE_CODE } from '../eligian-validator.js';
import { DIAGNOSTIC_CODES, type DiagnosticSource, isDiagnosticCode } from '../validators/codes.js';
import {
  END_BLOCK_RUNTIME_CONST_CODE,
  INVALID_CONSTANT_CODE,
  RUNTIME_CONCAT_CONTEXT_CODE,
  RUNTIME_CONCAT_OPERAND_CODE,
  RUNTIME_NEGATION_CODE,
  RUNTIME_OPERATOR_CODE,
} from '../validators/expression-validator.js';
import { INVALID_SET_DATA_TARGET_CODE } from '../validators/operation-call/set-data-validator.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, '..');
const repoRoot = path.resolve(testDir, '../../../..');

const BASELINE_PATH = path.join(
  repoRoot,
  'specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-before.json'
);

const DROPPED_PATH = path.join(
  repoRoot,
  'specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-dropped.txt'
);

const SOURCES: readonly DiagnosticSource[] = ['parser', 'validator', 'type', 'linker', 'compiler'];

/** The new codes of plan A1, by source. */
const NEW_CODES: readonly string[] = [
  // parser
  'syntax-error',
  // linker
  'unresolved-reference',
  // type
  'type-mismatch',
  'constant-reserved-name',
  'constant-cycle',
  'if-condition-not-boolean',
  'if-empty-then',
  'for-collection-not-array',
  'for-empty-body',
  'event-start-negative',
  'event-duration-relative',
  'event-duration-not-positive',
  'event-end-not-after-start',
  'sequence-item-duration-not-positive',
  'stagger-delay-not-positive',
  'stagger-duration-not-positive',
  'import-duplicate-default',
  'asset-type-conflict',
  'languages-duplicate-code',
  'languages-missing-default',
  'languages-multiple-defaults',
  'timeline-empty',
  // validator
  'timeline-provider-invalid',
  'timeline-source-required',
  'timeline-source-unused',
  'timeline-scroll-duration-required',
  'timeline-scroll-selector-not-scroll',
  'timeline-duration-relative',
  'timeline-duration-not-positive',
  'event-ends-after-timeline',
  'break-outside-loop',
  'continue-outside-loop',
  'operation-in-timeline-event',
  'unknown-action-in-timeline-event',
  'html-import-error',
  'css-import-error',
  'css-parse-error',
  'media-import-error',
  'locales-import-error',
  'locales-without-languages',
  'locales-parse-failed',
  'timeline-required',
  'validation-exception',
  // compiler
  'compile-parse-error',
  'compile-validation-error',
  'compile-type-error',
  'compile-transform-error',
  'compile-emit-error',
  'file-unreadable',
];

interface BaselineEntry {
  readonly code: string;
  readonly kind: string;
  readonly sites: readonly string[];
}

function readBaseline(): readonly BaselineEntry[] {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as BaselineEntry[];
}

/** Every string of every `code: 'A' | 'B';` union in a source module. */
function codeUnionValues(relativePath: string): string[] {
  const text = readFileSync(path.join(srcDir, relativePath), 'utf-8');
  const values: string[] = [];
  for (const match of text.matchAll(/code:\s*((?:'[^']+'\s*\|?\s*)+);/g)) {
    for (const literal of match[1].matchAll(/'([^']+)'/g)) {
      values.push(literal[1]);
    }
  }
  return values;
}

/** Every `.ts` file under a `src`-relative directory, `__tests__` excluded, as `src`-relative paths. */
function sourceFilesUnder(relativeDir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(path.join(srcDir, relativeDir), { withFileTypes: true })) {
    const relative = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') files.push(...sourceFilesUnder(relative));
    } else if (entry.name.endsWith('.ts')) {
      files.push(relative);
    }
  }
  return files;
}

/**
 * The FR-001 scope (plan A2): `validators/**`, `eligian-validator.ts`,
 * `type-system-typir/validation/**`, plus every file of a `kind: 'literal'` baseline site.
 */
function registryScope(): string[] {
  const prefix = 'packages/language/src/';
  const literalFiles = readBaseline()
    .filter(e => e.kind === 'literal')
    .flatMap(e => e.sites.map(site => site.replace(/:\d+$/, '').slice(prefix.length)));
  return [
    ...new Set([
      ...sourceFilesUnder('validators'),
      'eligian-validator.ts',
      ...sourceFilesUnder('type-system-typir/validation'),
      ...literalFiles,
    ]),
  ].sort();
}

/**
 * `code: '…'` literals that the baseline enumeration investigated and found never to reach a
 * diagnostic (`emittable-codes-dropped.txt`, reason "not in an accept info object"), as
 * `file|code` keys. They are not diagnostic codes, so the registry cannot hold them.
 */
function nonDiagnosticLiterals(): Set<string> {
  const pattern =
    /^packages\/language\/src\/(\S+):\d+\s+code: '([^']*)'\s+--\s+not in an accept info object/;
  const keys = new Set<string>();
  for (const line of readFileSync(DROPPED_PATH, 'utf-8').split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match) keys.add(`${match[1]}|${match[2]}`);
  }
  return keys;
}

/** Comments and string / template contents replaced by spaces (quotes and newlines kept). */
function blankCommentsAndStrings(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    let end: number;
    if (ch === '/' && next === '/') {
      end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
      out += blank(text.slice(i, end));
    } else if (ch === '/' && next === '*') {
      end = text.indexOf('*/', i + 2);
      end = end === -1 ? text.length : end + 2;
      out += blank(text.slice(i, end));
    } else if (ch === "'" || ch === '"' || ch === '`') {
      end = i + 1;
      while (end < text.length && text[end] !== ch) end += text[end] === '\\' ? 2 : 1;
      out += `${ch}${blank(text.slice(i + 1, end))}${end < text.length ? ch : ''}`;
      end = Math.min(end + 1, text.length);
    } else {
      out += ch;
      end = i + 1;
    }
    i = end;
  }
  return out;
}

/**
 * An accepted `code:` value: `diagnosticCode(`, or an identifier / member access (`error.code`,
 * `diagnostic.code`, `ASSET_ERROR_CODES[error._tag]`), optionally `.toLowerCase()`.
 */
const ACCEPTED_CODE_VALUE =
  /^(?:diagnosticCode\(|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[\w$.]+\])*(?:\.toLowerCase\(\))?\s*(?:[,;})\]]|$))/;

/** A `*_CODE = '…'` constant whose value is a bare string literal. */
const LITERAL_CODE_CONSTANT = /\b[A-Z][A-Z0-9_]*_CODE\s*(?::[^=\n]+)?=\s*['"`]/g;

/** The `file:line` sites of a scope file that write a diagnostic code as a string literal. */
function literalCodeSites(relativeFile: string, exempt: ReadonlySet<string>): string[] {
  const original = readFileSync(path.join(srcDir, relativeFile), 'utf-8');
  const text = blankCommentsAndStrings(original);
  const lineOf = (offset: number) => text.slice(0, offset).split('\n').length;
  const offenders: string[] = [];

  for (const match of text.matchAll(/\bcode\s*:/g)) {
    if (/\breadonly\s+$/.test(text.slice(0, match.index))) continue; // type member
    let valueOffset = match.index + match[0].length;
    while (/\s/.test(text[valueOffset] ?? '')) valueOffset++;
    const value = text.slice(valueOffset);
    if (value.startsWith('|')) continue; // multi-line type union
    const literal = /^(['"`])\s*\1/.exec(value);
    if (literal && /^\s*[|;]/.test(value.slice(literal[0].length))) continue; // type position
    if (ACCEPTED_CODE_VALUE.test(value)) continue;
    if (literal) {
      const code = original.slice(valueOffset + 1, valueOffset + literal[0].length - 1);
      if (exempt.has(`${relativeFile}|${code}`)) continue;
    }
    offenders.push(`${relativeFile}:${lineOf(valueOffset)}`);
  }

  for (const match of text.matchAll(LITERAL_CODE_CONSTANT)) {
    offenders.push(`${relativeFile}:${lineOf(match.index)}`);
  }
  return offenders;
}

function sourceOf(code: string): DiagnosticSource | undefined {
  return DIAGNOSTIC_CODES.find(e => e.code === code)?.source;
}

describe('diagnostic code registry', () => {
  it('entries have exactly code and source', () => {
    expect(DIAGNOSTIC_CODES.length).toBeGreaterThan(0);
    for (const e of DIAGNOSTIC_CODES) {
      expect(Object.keys(e).sort()).toEqual(['code', 'source']);
      expect(SOURCES).toContain(e.source);
    }
  });

  it('codes are unique', () => {
    expect(new Set(DIAGNOSTIC_CODES.map(e => e.code)).size).toBe(DIAGNOSTIC_CODES.length);
  });

  it('sources of syntax-error, unresolved-reference, type-mismatch and the compile codes', () => {
    const expected: [string, DiagnosticSource][] = [
      ['syntax-error', 'parser'],
      ['unresolved-reference', 'linker'],
      ['type-mismatch', 'type'],
      ['compile-parse-error', 'compiler'],
      ['compile-validation-error', 'compiler'],
      ['compile-type-error', 'compiler'],
      ['compile-transform-error', 'compiler'],
      ['compile-emit-error', 'compiler'],
      ['file-unreadable', 'compiler'],
      ['validation-exception', 'validator'],
    ];
    for (const [code, source] of expected) {
      expect(sourceOf(code), code).toBe(source);
    }
  });

  it('keeps every code emittable before Phase 0', () => {
    const entries = readBaseline();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter(e => !isDiagnosticCode(e.code))).toEqual([]);
  });

  it('the registry is exactly the baseline plus the new codes', () => {
    const expected = new Set([...readBaseline().map(e => e.code), ...NEW_CODES]);
    const actual = new Set<string>(DIAGNOSTIC_CODES.map(e => e.code));
    const missing = [...expected].filter(c => !actual.has(c));
    const extra = [...actual].filter(c => !expected.has(c));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('new codes are kebab-case', () => {
    const baseline = new Set(readBaseline().map(e => e.code));
    const offenders = DIAGNOSTIC_CODES.map(e => e.code).filter(
      c => !baseline.has(c) && !/^[a-z]+(-[a-z]+)*$/.test(c)
    );
    expect(offenders).toEqual([]);
  });

  it('non-emittable literals are not codes', () => {
    for (const literal of [
      'CONTROL_FLOW',
      'UNKNOWN_OPERATION',
      'PARAMETER_COUNT',
      'PARAMETER_TYPE',
      'MISSING_DEPENDENCY',
      'MAPPING_ERROR',
      'ERROR_CODE',
      'unknown-operation',
    ]) {
      expect(isDiagnosticCode(literal), literal).toBe(false);
    }
  });

  it('every derivable code is registered', () => {
    const operationCodes = codeUnionValues('compiler/operations/validation/errors.ts').map(c =>
      c.toLowerCase()
    );
    const importCodes = codeUnionValues('validators/validation-errors.ts');
    const derivable = new Set([...operationCodes, ...importCodes]);

    expect(derivable.size).toBeGreaterThan(0);
    for (const code of ['unknown_operation', 'parameter_count', 'parameter_type', 'control_flow']) {
      expect(derivable.has(code), code).toBe(true);
    }

    const constants = [
      RUNTIME_NEGATION_CODE,
      RUNTIME_OPERATOR_CODE,
      INVALID_CONSTANT_CODE,
      RUNTIME_CONCAT_CONTEXT_CODE,
      RUNTIME_CONCAT_OPERAND_CODE,
      END_BLOCK_RUNTIME_CONST_CODE,
      INVALID_SET_DATA_TARGET_CODE,
      MISSING_LABELS_FILE_CODE,
    ];
    const unregistered = [...derivable, ...constants].filter(c => !isDiagnosticCode(c));
    expect(unregistered).toEqual([]);
  });

  it('validators use the registry, not string literals', () => {
    const scope = registryScope();
    for (const file of [
      'validators/timeline-validator.ts',
      'eligian-validator.ts',
      'type-system-typir/validation/label-id-validation.ts',
      'css/selector-sources.ts',
      'css/selector-validation.ts',
      'dataflow/operation-dataflow.ts',
    ]) {
      expect(scope, file).toContain(file);
    }

    const exempt = nonDiagnosticLiterals();
    expect(exempt.size).toBeGreaterThan(0);
    const offenders = scope.flatMap(file => literalCodeSites(file, exempt));
    expect(offenders).toEqual([]);
  });
});
