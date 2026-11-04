/**
 * Custom Document Validator for Eligian DSL
 *
 * Feature 007: Filters out linking errors for unresolved OperationCall references.
 * When operationName doesn't resolve to an ActionDefinition, it's not an error -
 * it just means it's a built-in operation, which will be validated separately.
 *
 * Spec 058 (Phase 0): registry codes on the built-in diagnostics (`syntax-error`,
 * `unresolved-reference`), `type-mismatch` for uncoded Typir-core problems, and Typir's
 * "While validating …, this <severity> is found: " prefix stripped from Typir messages.
 */

import {
  type AstNode,
  DefaultDocumentValidator,
  type DiagnosticInfo,
  DocumentValidator,
  type LangiumDocument,
  type ParseResult,
  type ValidationOptions,
  type ValidationSeverity,
} from 'langium';
import { isValidationProblem } from 'typir';
import type { Diagnostic } from 'vscode-languageserver-types';
import { isOperationCall } from './generated/ast.js';
import { diagnosticCode } from './validators/codes.js';

/**
 * Remove Typir's `While validating <node>, this <severity> is found: ` prefix (typir
 * `printing.js`); the problem's own message and the sub-problems after it are kept.
 *
 * Anchored on `problem.message`, so a node text that itself contains
 * `", this error is found: "` does not cut the message short. A message without the prefix is
 * returned unchanged.
 */
export function stripTypirPrefix(
  message: string,
  problem: { severity: string; message: string }
): string {
  if (!message.startsWith('While validating ')) {
    return message;
  }
  const separator = `, this ${problem.severity} is found: `;
  const at = message.indexOf(`${separator}${problem.message}`);
  return at < 0 ? message : message.slice(at + separator.length);
}

export class EligianDocumentValidator extends DefaultDocumentValidator {
  /** Lexer diagnostics get the registry code `syntax-error`; `data.code` stays `lexing-error`. */
  protected override processLexingErrors(
    parseResult: ParseResult,
    diagnostics: Diagnostic[],
    options: ValidationOptions
  ): void {
    const from = diagnostics.length;
    super.processLexingErrors(parseResult, diagnostics, options);
    for (let i = from; i < diagnostics.length; i++) {
      diagnostics[i].code = diagnosticCode('syntax-error');
    }
  }

  /** Parser diagnostics get the registry code `syntax-error`; `data.code` stays `parsing-error`. */
  protected override processParsingErrors(
    parseResult: ParseResult,
    diagnostics: Diagnostic[],
    options: ValidationOptions
  ): void {
    const from = diagnostics.length;
    super.processParsingErrors(parseResult, diagnostics, options);
    for (let i = from; i < diagnostics.length; i++) {
      diagnostics[i].code = diagnosticCode('syntax-error');
    }
  }

  /**
   * Override to filter out linking errors for OperationCall.operationName.
   *
   * When an OperationCall's operationName doesn't resolve to an ActionDefinition,
   * it means it's a built-in operation (like selectElement, animate, etc).
   * This is not an error - the operation validator will check if it's valid.
   *
   * Every other linking error carries the registry code `unresolved-reference` and Langium's
   * own `data` (`linking-error`, containerType, property, refText).
   */
  protected override processLinkingErrors(
    document: LangiumDocument,
    diagnostics: Diagnostic[],
    _options: ValidationOptions
  ): void {
    // Get all linking errors from the document
    for (const reference of document.references) {
      const linkingError = reference.error;

      if (linkingError) {
        // Check if this is an OperationCall.operationName reference
        const container = linkingError.info.container;
        const property = linkingError.info.property;

        if (isOperationCall(container) && property === 'operationName') {
          // Skip this linking error - unresolved operationName means it's a built-in operation
          // The operation validator will check if the operation exists
          continue;
        }

        // For all other linking errors, create diagnostic and add to array
        const diagnostic = this.toDiagnostic('error', linkingError.message, {
          node: container,
          property,
          index: linkingError.info.index,
          code: diagnosticCode('unresolved-reference'),
          data: {
            code: DocumentValidator.LinkingError,
            containerType: container.$type,
            property,
            refText: linkingError.info.reference.$refText,
          },
        });
        diagnostics.push(diagnostic);
      }
    }
  }

  /**
   * Every `validateAst` acceptor call goes through here. Typir problems (Eligian rules and
   * Typir core alike) lose Typir's prefix; a Typir problem without a code is `type-mismatch`.
   */
  protected override toDiagnostic<N extends AstNode>(
    severity: ValidationSeverity,
    message: string,
    info: DiagnosticInfo<N, string>
  ): Diagnostic {
    if (!isValidationProblem(info)) {
      return super.toDiagnostic(severity, message, info);
    }
    return super.toDiagnostic(severity, stripTypirPrefix(message, info), {
      ...info,
      code: info.code ?? diagnosticCode('type-mismatch'),
    });
  }
}
