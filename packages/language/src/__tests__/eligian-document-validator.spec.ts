/**
 * EligianDocumentValidator: registry codes on the built-in diagnostics and the Typir prefix strip
 * (spec 058 Phase 0: FR-004b, FR-005, FR-006, SC-016 unit part, SC-017).
 *
 * - Lexer and parser diagnostics carry the top-level code `syntax-error`; Langium's `data.code`
 *   (`lexing-error` / `parsing-error`) stays, so `stopAfterLexing/ParsingErrors` keeps working.
 * - Linking diagnostics carry `unresolved-reference` and keep Langium's `data`
 *   (`linking-error`, containerType, property, refText). Unresolved `OperationCall.operationName`
 *   references (built-in operations) still yield no linking diagnostic.
 * - Typir diagnostics (Eligian rules and Typir core) lose Typir's
 *   `While validating the AstNode '…', this <severity> is found: ` prefix; code, severity and
 *   range are kept. A Typir-core problem without a code gets `type-mismatch`.
 */

import {
  AstUtils,
  DocumentValidator,
  EmptyFileSystem,
  getDiagnosticRange,
  type LangiumDocument,
} from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { stripTypirPrefix } from '../eligian-document-validator.js';
import { createEligianServices } from '../eligian-module.js';
import {
  type DefaultImport,
  type EligianAstType,
  isDefaultImport,
  isOperationCall,
  type Program,
} from '../generated/ast.js';
import { DIAGNOSTIC_CODES } from '../validators/codes.js';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

const TYPIR_PREFIX = /^While validating /;

describe('EligianDocumentValidator codes', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  /** Parse (with linking, no validation), then run the document validator directly. */
  async function validate(
    src: string
  ): Promise<{ document: LangiumDocument<Program>; diagnostics: Diagnostic[] }> {
    const document = await ctx.parse(src);
    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);
    return { document, diagnostics };
  }

  function withDataCode(diagnostics: Diagnostic[], dataCode: string): Diagnostic[] {
    return diagnostics.filter(d => (d.data as { code?: string } | undefined)?.code === dataCode);
  }

  it('parse error: code syntax-error, data.code parsing-error', async () => {
    const { diagnostics } = await validate(`
      action broken( [
        wait(1)
      ]
    `);
    const parsing = withDataCode(diagnostics, DocumentValidator.ParsingError);
    expect(parsing.length).toBeGreaterThan(0);
    for (const d of parsing) {
      expect(d.code).toBe('syntax-error');
      expect((d.data as { code: string }).code).toBe('parsing-error');
    }
  });

  it('lexer error: syntax-error + lexing-error', async () => {
    const { diagnostics } = await validate(`
      action lexed() [
        wait(1)
      ]
      §
    `);
    const lexing = withDataCode(diagnostics, DocumentValidator.LexingError);
    expect(lexing.length).toBeGreaterThan(0);
    for (const d of lexing) {
      expect(d.code).toBe('syntax-error');
      expect((d.data as { code: string }).code).toBe('lexing-error');
    }
  });

  it('linking error: unresolved-reference, data kept', async () => {
    const { diagnostics } = await validate(`
      timeline "t" in "#c" using raf {
        at 0s..1s [ wait(1) ] [ wait(1) ]
        at nope.end..2s [ wait(1) ] [ wait(1) ]
      }
    `);
    const linking = diagnostics.filter(d => d.code === 'unresolved-reference');
    expect(linking).toHaveLength(1);
    const data = linking[0].data as {
      code?: string;
      containerType?: string;
      property?: string;
      refText?: string;
    };
    expect(data.code).toBe('linking-error');
    expect(data.containerType).toBeDefined();
    expect(data.property).toBeDefined();
    expect(data.refText).toBeDefined();
    expect(data.refText).toBe('nope');
  });

  it('unknown operation name: no linking diagnostic', async () => {
    const { document, diagnostics } = await validate(`
      timeline "t" in "#c" using raf {
        at 0s..1s notARealOperationName()
      }
    `);
    // The program really contains the unresolved OperationCall.operationName reference.
    const calls = AstUtils.streamAst(document.parseResult.value)
      .filter(isOperationCall)
      .filter(call => call.operationName.$refText === 'notARealOperationName')
      .toArray();
    expect(calls).toHaveLength(1);
    expect(withDataCode(diagnostics, DocumentValidator.LinkingError)).toEqual([]);
    expect(diagnostics.filter(d => d.code === 'unresolved-reference')).toEqual([]);
  });

  it('Typir rule and Typir core diagnostics lose the prefix; code, severity and range kept', async () => {
    // Eligian Typir rule (import-validation.ts): a second `styles` import.
    const rule = await validate(`
      styles "./a.css"
      styles "./b.css"

      timeline "t" in "#c" using raf {
        at 0s..1s [ wait(1) ] [ wait(1) ]
      }
    `);
    const duplicate = rule.diagnostics.filter(d => d.message.includes("Duplicate 'styles' import"));
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].message).not.toMatch(TYPIR_PREFIX);
    expect(duplicate[0].message).toMatch(/^Duplicate 'styles' import\./);
    expect(duplicate[0].code).toBe('import-duplicate-default');
    expect(duplicate[0].severity).toBe(DiagnosticSeverity.Error);
    const imports = rule.document.parseResult.value.statements.filter(isDefaultImport);
    const second = imports[1] as DefaultImport;
    expect(duplicate[0].range).toEqual(getDiagnosticRange({ node: second, property: 'type' }));

    // Typir core (function-call validation of a typed action parameter).
    const core = await validate(`
      action typedCoreMismatch(count: number) [
        wait(count)
      ]

      timeline "t" in "#c" using raf {
        at 0s..1s typedCoreMismatch("not a number")
      }
    `);
    const mismatch = core.diagnostics.filter(d =>
      d.message.includes("the call of 'typedCoreMismatch' don't match")
    );
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].message).not.toMatch(TYPIR_PREFIX);
    expect(mismatch[0].message).toMatch(
      /^The given operands for the call of 'typedCoreMismatch' don't match\./
    );
    expect(mismatch[0].code).toBe('type-mismatch');
    expect(mismatch[0].severity).toBe(DiagnosticSeverity.Error);
    const call = AstUtils.streamAst(core.document.parseResult.value)
      .filter(isOperationCall)
      .find(c => c.operationName.$refText === 'typedCoreMismatch');
    expect(call).toBeDefined();
    expect(mismatch[0].range).toEqual(getDiagnosticRange({ node: call! }));
  });

  it('a throwing check yields validation-exception', async () => {
    // Own services instance: the throwing check must not leak into the shared test context.
    const services = createEligianServices(EmptyFileSystem);
    services.Eligian.validation.ValidationRegistry.register<EligianAstType>({
      Program: () => {
        throw new Error('boom');
      },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const document = await parseHelper<Program>(services.Eligian)(`
        timeline "t" in "#c" using raf {
          at 0s..1s [ wait(1) ] [ wait(1) ]
        }
      `);
      const diagnostics =
        await services.Eligian.validation.DocumentValidator.validateDocument(document);
      const exception = diagnostics.filter(d =>
        d.message.startsWith('An error occurred during validation: boom')
      );
      expect(exception).toHaveLength(1);
      expect(exception[0].code).toBe('validation-exception');
      expect(DIAGNOSTIC_CODES.find(e => e.code === 'validation-exception')!.source).toBe(
        'validator'
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('stripTypirPrefix', () => {
  const duplicate = "Duplicate 'styles' import. Only one styles import is allowed per document.";
  const unusedSource = `Timeline provider 'raf' does not use a source file. Remove: from "x.mp4"`;
  const operands = "The given operands for the call of 'a1' don't match.";
  // Sub-problems as Typir's printer appends them (printing.js printSubProblems / printIndentation);
  // nested ones carry their own prefix, which is part of the kept text.
  const subProblems = [
    `-> While validating the AstNode 'a1("x")', this error is found: The given arguments don't match the parameters of 'a1(count: number): ($return: any)'.`,
    `--> While validating the AstNode '"x"', this error is found: The parameter 'count' at index 0 got a value with a wrong type.`,
    "---> For property 'count', the types 'string' and 'number' do not match.",
    "----> The type 'string' is not assignable to the type 'number'.",
  ].join('\n');

  it.each<
    [
      label: string,
      message: string,
      problem: { severity: string; message: string },
      expected: string,
    ]
  >([
    [
      'an error prefix',
      `While validating the AstNode 'styles "./b.css"', this error is found: ${duplicate}`,
      { severity: 'error', message: duplicate },
      duplicate,
    ],
    [
      'a warning prefix',
      `While validating the AstNode 'timeline "t" in "#c" using raf from "x.mp4" { }', this warning is found: ${unusedSource}`,
      { severity: 'warning', message: unusedSource },
      unusedSource,
    ],
    [
      'a node text that itself contains ", this error is found: "',
      `While validating the AstNode 'a1(", this error is found: ")', this error is found: ${operands}`,
      { severity: 'error', message: operands },
      operands,
    ],
    [
      'sub-problems after the message are kept',
      `While validating the AstNode 'a1("x")', this error is found: ${operands}\n${subProblems}`,
      { severity: 'error', message: operands },
      `${operands}\n${subProblems}`,
    ],
    [
      'a non-matching message is returned unchanged',
      'Unknown operation: fooBar',
      { severity: 'error', message: 'Unknown operation: fooBar' },
      'Unknown operation: fooBar',
    ],
    [
      'a prefix naming a different problem message is returned unchanged',
      `While validating the AstNode 'x', this error is found: ${operands}`,
      { severity: 'error', message: duplicate },
      `While validating the AstNode 'x', this error is found: ${operands}`,
    ],
  ])('%s', (_label, message, problem, expected) => {
    expect(stripTypirPrefix(message, problem)).toBe(expected);
  });
});
