/**
 * Custom Document Validator for Eligian DSL
 *
 * Feature 007: Filters out linking errors for unresolved OperationCall references.
 * When operationName doesn't resolve to an ActionDefinition, it's not an error -
 * it just means it's a built-in operation, which will be validated separately.
 */

import { DefaultDocumentValidator, type LangiumDocument, type ValidationOptions } from 'langium';
import type { Diagnostic } from 'vscode-languageserver-types';
import { isOperationCall } from './generated/ast.js';

export class EligianDocumentValidator extends DefaultDocumentValidator {
  /**
   * Override to filter out linking errors for OperationCall.operationName.
   *
   * When an OperationCall's operationName doesn't resolve to an ActionDefinition,
   * it means it's a built-in operation (like selectElement, animate, etc).
   * This is not an error - the operation validator will check if it's valid.
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
          node: linkingError.info.container,
          property: linkingError.info.property,
          index: linkingError.info.index,
        });
        diagnostics.push(diagnostic);
      }
    }
  }
}
