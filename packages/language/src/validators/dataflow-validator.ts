import type { ValidationAcceptor } from 'langium';
import { OperationDataflow } from '../dataflow/operation-dataflow.js';
import type { EligianServices } from '../eligian-module.js';
import type { EligianScopeProvider } from '../eligian-scope-provider.js';
import type { Library, Program } from '../generated/ast.js';
import { findCallableAction } from '../utils/action-scope.js';
import { BaseValidator } from './base-validator.js';

/**
 * Operation-data dependencies (spec 047): runs the shared dataflow analysis
 * once per document and reports its diagnostics. The compiler runs the same
 * analysis (ast-transformer.ts), so the editor and compile results agree.
 */
export class DataflowValidator extends BaseValidator {
  checkOperationData(root: Program | Library, accept: ValidationAcceptor): void {
    for (const diagnostic of createDataflow(this.services).analyzeDocument(root)) {
      accept('error', diagnostic.message, {
        node: diagnostic.node,
        ...(diagnostic.property ? { property: diagnostic.property as never } : {}),
        code: diagnostic.code,
      });
    }
  }
}

/** A dataflow analysis that resolves actions by name through the IDE scope provider. */
export function createDataflow(services: EligianServices): OperationDataflow {
  const scopeProvider = services.references.ScopeProvider as EligianScopeProvider;
  return new OperationDataflow({
    resolveAction: (context, name) =>
      findCallableAction(name, scopeProvider.getCallableActions(context))?.action,
  });
}
