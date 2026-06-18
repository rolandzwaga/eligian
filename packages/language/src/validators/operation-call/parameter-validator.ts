import type { AstNode, ValidationAcceptor } from 'langium';
import {
  hasOperation,
  OPERATION_REGISTRY,
  validateDependencies,
  validateParameterCount,
  validateParameterTypes,
} from '../../compiler/index.js';
import { findActionByName } from '../../compiler/name-resolver.js';
import type { EligianScopeProvider } from '../../eligian-scope-provider.js';
import { isStaggerBlock, type OperationCall } from '../../generated/ast.js';
import { formatValidationMessage } from '../../utils/error-builder.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { BaseValidator } from '../base-validator.js';
import { findImportedActionByNameOrAlias } from './action-resolution.js';

/**
 * Validates operation/action call argument counts, parameter types, and
 * (informational) operation dependencies.
 *
 * Split out of the former monolithic `OperationCallValidator` (W1) as the
 * "parameter count / type" check family.
 */
export class ParameterValidator extends BaseValidator {
  /**
   * Report an `invalid_parameter_count` error when an action call's argument
   * count does not match its declared parameter count.
   *
   * Single source of truth (D28) for the identical expected-vs-actual check that
   * was hand-coded for local, imported, and library action calls.
   *
   * @param opName - The action name as written at the call site
   * @param parameters - The action's declared parameters (undefined → 0 expected)
   * @param argumentCount - Number of arguments supplied at the call site
   * @param node - The call node to attach the diagnostic to
   * @param accept - Langium validation acceptor
   */
  private reportActionParameterCountError(
    opName: string,
    parameters: ReadonlyArray<{ name: string }> | undefined,
    argumentCount: number,
    node: AstNode,
    accept: ValidationAcceptor,
    implicitArgs = 0
  ): void {
    // `implicitArgs` are parameters the call site doesn't supply explicitly — a
    // `stagger`'s action-call form fills the action's first parameter with the
    // current item, so callers write `with revealCard()` for a 1-param action.
    const declared = parameters?.length ?? 0;
    const expectedCount = Math.max(0, declared - implicitArgs);
    if (argumentCount !== expectedCount) {
      const explicitNames =
        parameters
          ?.slice(implicitArgs)
          .map(p => p.name)
          .join(', ') ?? '';
      accept(
        'error',
        `Action '${opName}' expects ${expectedCount} argument(s) but got ${argumentCount}. Expected: ${explicitNames}`,
        {
          node,
          property: 'args',
          code: 'invalid_parameter_count',
        }
      );
    }
  }

  /**
   * Validate that the correct number of parameters are provided.
   * Checks against required and optional parameters from the registry.
   */
  checkParameterCount(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = getOperationCallName(operation);
    const argumentCount = operation.args.length;

    // Feature 035: Skip parameter count validation for addController
    // (handled by checkControllerCall instead)
    if (opName === 'addController') {
      return;
    }

    // A `stagger … with action()` call has its first parameter auto-filled with
    // the current item, so one fewer explicit argument is expected.
    const implicitArgs =
      isStaggerBlock(operation.$container) && operation.$containerProperty === 'actionCall' ? 1 : 0;

    // Check if this is an action call (local, library, or imported)
    const program = this.getProgram(operation);
    if (program) {
      // Check local action
      const localAction = findActionByName(opName, program);
      if (localAction) {
        this.reportActionParameterCountError(
          opName,
          localAction.parameters,
          argumentCount,
          operation,
          accept,
          implicitArgs
        );
        return;
      }

      // Check imported action
      // Feature 032 Fix: Must check aliases as well as original action names
      if (this.services) {
        const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
        const importedActions = scopeProvider.getImportedActions(program);
        const importedAction = findImportedActionByNameOrAlias(opName, program, importedActions);
        if (importedAction) {
          this.reportActionParameterCountError(
            opName,
            importedAction.parameters,
            argumentCount,
            operation,
            accept,
            implicitArgs
          );
          return;
        }
      }
    }

    // Check library action (for library files themselves)
    const library = this.getLibrary(operation);
    if (library) {
      const libraryAction = library.actions?.find(a => a.name === opName);
      if (libraryAction) {
        this.reportActionParameterCountError(
          opName,
          libraryAction.parameters,
          argumentCount,
          operation,
          accept,
          implicitArgs
        );
        return;
      }
    }

    // Only validate built-in operations if not an action
    if (!hasOperation(opName)) {
      return;
    }

    const signature = OPERATION_REGISTRY[opName];

    // Use compiler validation logic
    const error = validateParameterCount(signature, argumentCount);

    if (error) {
      const message = formatValidationMessage(error.message, error.hint);

      accept('error', message, {
        node: operation,
        property: 'args',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate parameter types match expected types from operation signature.
   * Performs compile-time type checking where possible.
   *
   * Property chains and expressions are validated at runtime, not compile-time.
   */
  checkParameterTypes(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = getOperationCallName(operation);

    // Feature 035: Skip parameter type validation for addController
    // (handled by checkControllerCall instead)
    if (opName === 'addController') {
      return;
    }

    // Only validate if operation exists (avoid duplicate errors)
    if (!hasOperation(opName)) {
      return;
    }

    const signature = OPERATION_REGISTRY[opName];

    // Use compiler validation logic
    const errors = validateParameterTypes(signature, operation.args);

    // Report each type error
    for (const error of errors) {
      const message = formatValidationMessage(error.message, error.hint);

      accept('error', message, {
        node: operation,
        property: 'args',
        index: error.parameterIndex,
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate dependencies for operation calls.
   *
   * Note: This is a simplified implementation that only checks if the operation
   * HAS dependencies (warns user they need to ensure dependencies are available).
   * Full dependency tracking across operation sequences would require analyzing
   * the entire action/event context, which is more complex and will be implemented
   * in a future enhancement.
   *
   * For now, we just inform users about required dependencies.
   */
  checkDependencies(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = operation.operationName.$refText;

    // Only validate if operation exists (avoid duplicate errors)
    if (!hasOperation(opName)) {
      return;
    }

    const signature = OPERATION_REGISTRY[opName];

    // If operation has no dependencies, no validation needed
    if (signature.dependencies.length === 0) {
      return;
    }

    // For now, we just validate against an empty set (no outputs available)
    // This will warn about ALL dependencies since we don't track outputs yet
    // TODO: Enhance this to track outputs across operation sequences in the same action/event
    const availableOutputs = new Set<string>();
    const errors = validateDependencies(signature, availableOutputs);

    // Report dependency warnings
    for (const error of errors) {
      const message = formatValidationMessage(error.message, error.hint);

      // Use 'warning' instead of 'error' for now since we can't track dependencies perfectly
      // Once we implement full dependency tracking, change this to 'error'
      accept('warning', message, {
        node: operation,
        property: 'operationName',
        code: error.code.toLowerCase(),
      });
    }
  }
}
