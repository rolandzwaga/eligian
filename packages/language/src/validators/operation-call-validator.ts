import type { ValidationAcceptor } from 'langium';
import type { EligianServices } from '../eligian-module.js';
import type { OperationCall } from '../generated/ast.js';
import { BaseValidator } from './base-validator.js';
import { CssParameterValidator } from './operation-call/css-parameter-validator.js';
import { LabelParameterValidator } from './operation-call/label-parameter-validator.js';
import { OperationExistenceValidator } from './operation-call/operation-existence-validator.js';
import { ParameterValidator } from './operation-call/parameter-validator.js';

/**
 * Validations for operation calls (Eligius operations, action calls, CSS/label parameters).
 *
 * Thin delegator (W1 decomposition): the former ~1038-line monolith is split into
 * four collaborating, independently-testable validators grouped by check family —
 * existence/resolution, parameter count/type, CSS class/selector, and
 * controller/label-ID parameters. This class keeps the single registered DI
 * surface (`services.validation.EligianValidator.operationCall`) so the
 * `OperationCall` check map in {@link registerValidationChecks} is unchanged;
 * each registered method forwards to the owning collaborator.
 */
export class OperationCallValidator extends BaseValidator {
  private readonly existence: OperationExistenceValidator;
  private readonly parameters: ParameterValidator;
  private readonly css: CssParameterValidator;
  private readonly labels: LabelParameterValidator;

  constructor(services: EligianServices) {
    super(services);
    this.existence = new OperationExistenceValidator(services);
    this.parameters = new ParameterValidator(services);
    this.css = new CssParameterValidator(services);
    this.labels = new LabelParameterValidator(services);
  }

  checkOperationExists(operation: OperationCall, accept: ValidationAcceptor): void {
    this.existence.checkOperationExists(operation, accept);
  }

  checkTimelineOperationCall(call: OperationCall, accept: ValidationAcceptor): void {
    this.existence.checkTimelineOperationCall(call, accept);
  }

  checkParameterCount(operation: OperationCall, accept: ValidationAcceptor): void {
    this.parameters.checkParameterCount(operation, accept);
  }

  checkParameterTypes(operation: OperationCall, accept: ValidationAcceptor): void {
    this.parameters.checkParameterTypes(operation, accept);
  }

  checkDependencies(operation: OperationCall, accept: ValidationAcceptor): void {
    this.parameters.checkDependencies(operation, accept);
  }

  checkClassNameParameter(operation: OperationCall, accept: ValidationAcceptor): void {
    this.css.checkClassNameParameter(operation, accept);
  }

  checkSelectorParameter(operation: OperationCall, accept: ValidationAcceptor): void {
    this.css.checkSelectorParameter(operation, accept);
  }

  checkControllerCall(operation: OperationCall, accept: ValidationAcceptor): void {
    this.labels.checkControllerCall(operation, accept);
  }

  checkLabelIDParameter(operation: OperationCall, accept: ValidationAcceptor): void {
    this.labels.checkLabelIDParameter(operation, accept);
  }
}
