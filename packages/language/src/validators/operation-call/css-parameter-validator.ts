import type { ValidationAcceptor } from 'langium';
import { getOperationSignature } from '../../compiler/index.js';
import { findSimilarClasses } from '../../css/levenshtein.js';
import { calledAction, parameterRoles } from '../../css/parameter-roles.js';
import { reportNotInLayout, selectorNames } from '../../css/selector-sources.js';
import { reportSelectorIssues } from '../../css/selector-validation.js';
import { isStringLiteral, type OperationCall } from '../../generated/ast.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { BaseValidator } from '../base-validator.js';

/**
 * Validates CSS `className` and `selector` parameters of operation calls against
 * the classes/IDs declared in imported CSS files (Feature 013).
 *
 * Split out of the former monolithic `OperationCallValidator` (W1) as the
 * "CSS class / selector parameter" check family.
 */
export class CssParameterValidator extends BaseValidator {
  /**
   * Idea #18: string literals passed to an action's selector or className
   * parameters (css/parameter-roles.ts), checked like literals passed to the
   * operations themselves: `spotlight("#tok-timelin")`.
   */
  checkActionCallCssArguments(call: OperationCall, accept: ValidationAcceptor): void {
    if (!this.services) return;
    const action = calledAction(call);
    if (!action) return;
    const program = this.getProgram(call);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) return;

    const roles = parameterRoles(action);
    if (roles.size === 0) return;
    this.ensureCSSImportsRegistered(program, documentUri);
    let names: ReturnType<typeof selectorNames> | undefined;

    call.args.forEach((arg, index) => {
      const parameter = action.parameters[index];
      const role = parameter ? roles.get(parameter.name) : undefined;
      if (!role || !isStringLiteral(arg)) return;
      if (role === 'selector') {
        names ??= selectorNames(this.services!, program, documentUri);
        reportSelectorIssues(arg.value, arg, names.classes, names.ids, accept);
        reportNotInLayout(arg.value, arg, this.services!, program, documentUri, accept);
        return;
      }
      const classes = this.services!.css.CSSRegistry.getClassesForDocument(documentUri);
      if (!classes.has(arg.value)) {
        const suggestions = findSimilarClasses(arg.value, classes, 2, 3);
        accept(
          'error',
          `Unknown CSS class: '${arg.value}'.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ''}`,
          { node: arg, data: { code: 'unknown_css_class' } }
        );
      }
    });
  }

  /**
   * Feature 013 - T017: Validate className parameters in operation calls
   *
   * This validator checks if className parameters reference valid CSS classes
   * from imported CSS files. It provides "Did you mean?" suggestions for typos.
   *
   * Operations with className parameters (from OPERATION_REGISTRY):
   * - addClass(className)
   * - removeClass(className)
   * - toggleClass(className)
   */
  checkClassNameParameter(operation: OperationCall, accept: ValidationAcceptor): void {
    if (!this.services) return; // No services available

    const cssRegistry = this.services.css.CSSRegistry;

    // Find the root Program node
    const program = this.getProgram(operation);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) return; // No document URI available

    // CRITICAL: Register CSS imports BEFORE checking for classes
    // This ensures the registry has the document→CSS file mapping even if
    // child validators (like this one) run before parent validators (checkCSSImports)
    this.ensureCSSImportsRegistered(program, documentUri);

    // Get operation name
    const operationName = getOperationCallName(operation);
    if (!operationName) return;

    // Check if this operation has className parameters
    const operationSignature = getOperationSignature(operationName, operation);
    if (!operationSignature) return; // Unknown operation (will be caught by checkOperationExists)

    // Find className parameter indices
    const classNameParamIndices: number[] = [];
    for (let i = 0; i < operationSignature.parameters.length; i++) {
      const param = operationSignature.parameters[i];
      // Check if parameter type array includes 'ParameterType:className'
      // param.type can be ParameterType[] or ConstantValue[], we need to check if it's ParameterType[]
      if (
        Array.isArray(param.type) &&
        param.type.some(t => typeof t === 'string' && t === 'ParameterType:className')
      ) {
        classNameParamIndices.push(i);
      }
    }

    if (classNameParamIndices.length === 0) return; // No className parameters

    // Get available CSS classes from imported CSS files
    const availableClasses = cssRegistry.getClassesForDocument(documentUri);

    // Note: If no CSS files are imported (availableClasses.size === 0), we still validate.
    // With no CSS imported, ALL classes are invalid since there's no external CSS in Eligian.

    // Validate each className parameter
    for (const paramIndex of classNameParamIndices) {
      const arg = operation.args[paramIndex];
      if (!arg) continue; // Missing argument (will be caught by checkParameterCount)

      // Only validate string literals (not variables or expressions)
      if (arg.$type !== 'StringLiteral') continue;

      const className = arg.value;

      // Check if className exists in available classes
      if (!availableClasses.has(className)) {
        // Class not found - generate "Did you mean?" suggestions
        const suggestions = findSimilarClasses(className, availableClasses, 2, 3);

        let message = `Unknown CSS class: '${className}'.`;
        if (suggestions.length > 0) {
          message += ` Did you mean: ${suggestions.join(', ')}?`;
        }

        accept('error', message, {
          node: arg,
          data: {
            code: 'unknown_css_class',
          },
        });
      }
    }
  }

  /**
   * Feature 013 - T020: Validate selector parameters in operation calls
   *
   * This validator checks if selector parameters contain valid CSS classes and IDs
   * from imported CSS files. It validates each component of complex selectors.
   *
   * Operations with selector parameters (from OPERATION_REGISTRY):
   * - selectElement(selector)
   * - moveToNewParent(newParentSelector)
   */
  checkSelectorParameter(operation: OperationCall, accept: ValidationAcceptor): void {
    const operationName = getOperationCallName(operation);
    if (!this.services) {
      return;
    }

    // Find the root Program node
    const program = this.getProgram(operation);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) {
      return;
    }

    // CRITICAL: Register CSS imports BEFORE checking for classes/IDs
    this.ensureCSSImportsRegistered(program, documentUri);

    // operationName already declared at top of function
    if (!operationName) return;

    // Check if this operation has selector parameters
    const operationSignature = getOperationSignature(operationName, operation);
    if (!operationSignature) return;

    // Find selector parameter indices
    const selectorParamIndices: number[] = [];
    for (let i = 0; i < operationSignature.parameters.length; i++) {
      const param = operationSignature.parameters[i];
      if (
        Array.isArray(param.type) &&
        param.type.some(t => typeof t === 'string' && t === 'ParameterType:selector')
      ) {
        selectorParamIndices.push(i);
      }
    }

    if (selectorParamIndices.length === 0) return;

    // Idea #18: classes and ids of the imported CSS and of the layout HTML
    const { classes: availableClasses, ids: availableIDs } = selectorNames(
      this.services,
      program,
      documentUri
    );

    // Note: If no CSS files are imported (empty sets), we still validate.
    // With no CSS imported, ALL classes/IDs are invalid since there's no external CSS in Eligian.

    // Validate each selector parameter
    for (const paramIndex of selectorParamIndices) {
      const arg = operation.args[paramIndex];
      if (!arg) continue; // Missing argument (will be caught by checkParameterCount)

      // Only validate string literals (not variables or expressions)
      if (arg.$type !== 'StringLiteral') continue;

      const selectorString = arg.value;

      // Parse + report unknown classes/IDs (shared with the navigate check).
      reportSelectorIssues(selectorString, arg, availableClasses, availableIDs, accept);
      reportNotInLayout(selectorString, arg, this.services, program, documentUri, accept);
    }
  }
}
