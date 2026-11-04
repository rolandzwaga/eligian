import {
  type AstNode,
  type MaybePromise,
  type ValidationAcceptor,
  ValidationRegistry,
} from 'langium';
import { diagnosticCode } from './validators/codes.js';

/**
 * Codes the diagnostic Langium synthesises when a validation check throws
 * ("An error occurred during validation: …") as `validation-exception` (spec 058 FR-007).
 *
 * `wrapValidationException` captures the check's own `accept` inside `functionality`; the
 * `accept` passed here is used only for the exception diagnostic (and the before/after-document
 * variants), so wrapping it codes exactly that diagnostic.
 */
export class EligianValidationRegistry extends ValidationRegistry {
  protected override handleException(
    functionality: () => MaybePromise<void>,
    messageContext: string,
    accept: ValidationAcceptor,
    node: AstNode
  ): Promise<void> {
    return super.handleException(
      functionality,
      messageContext,
      (severity, message, info) =>
        accept(severity, message, { ...info, code: diagnosticCode('validation-exception') }),
      node
    );
  }
}
