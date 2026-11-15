import type { ValidationAcceptor } from 'langium';
import { findSimilarClasses } from '../../css/levenshtein.js';
import { ACTION_CONTROLLERS } from '../../dataflow/operation-dataflow.js';
import type { EligianScopeProvider } from '../../eligian-scope-provider.js';
import { isArrayLiteral, isStringLiteral, type OperationCall } from '../../generated/ast.js';
import { findCallableAction } from '../../utils/action-scope.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { BaseValidator } from '../base-validator.js';
import { diagnosticCode } from '../codes.js';

const END_PREFIX = 'end:';

/**
 * Action names in the action list of a listener controller (spec 058, FR-055):
 * `addController("DOMEventListenerController" | "KeyboardController", …, ["a", "end:b"])`.
 * Each name, `end:` stripped, must be an action the program can call (local or imported);
 * the engine fails at runtime on an unknown one. The call is read as the dataflow reads it
 * (`dataflow/operation-dataflow.ts`, `checkControllerActions`).
 */
export class ListenerActionValidator extends BaseValidator {
  /** addController("DOMEventListenerController" | "KeyboardController", …, [ "a", "end:b" ]) */
  checkListenerActionNames(operation: OperationCall, accept: ValidationAcceptor): void {
    if (getOperationCallName(operation) !== 'addController') return;
    const [controller, , actions] = operation.args;
    if (!isStringLiteral(controller) || !ACTION_CONTROLLERS.has(controller.value)) return;
    if (!isArrayLiteral(actions)) return;

    const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
    const callables = scopeProvider.getCallableActions(operation);

    for (const element of actions.elements) {
      if (!isStringLiteral(element)) return; // dynamic list from here on: unknown
      const name = element.value.startsWith(END_PREFIX)
        ? element.value.slice(END_PREFIX.length)
        : element.value;
      if (findCallableAction(name, callables)) continue;

      const suggestions = findSimilarClasses(name, new Set(callables.map(c => c.name)), 2, 3);
      accept(
        'error',
        `Unknown action "${name}" in the ${controller.value} action list: no action with that name is declared or imported`,
        { node: element, data: { code: diagnosticCode('unknown-listener-action'), suggestions } }
      );
    }
  }
}
