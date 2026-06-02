import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AstNode, ValidationAcceptor } from 'langium';
import { URI } from 'vscode-uri';
import {
  hasOperation,
  OPERATION_REGISTRY,
  validateDependencies,
  validateOperationExists,
  validateParameterCount,
  validateParameterTypes,
} from '../compiler/index.js';
import { findActionByName } from '../compiler/name-resolver.js';
import { getController, isController } from '../completion/metadata/controllers.generated.js';
import { findSimilarClasses } from '../css/levenshtein.js';
import { parseSelector } from '../css/selector-parser.js';
import type { EligianScopeProvider } from '../eligian-scope-provider.js';
import type { ActionDefinition, OperationCall, Program, TimedEvent } from '../generated/ast.js';
import { isLibraryImport } from '../generated/ast.js';
import { extractLanguageCodes } from '../labels/index.js';
import { extractTranslationKeys } from '../locales/translation-key-extractor.js';
import { validateLabelID } from '../type-system-typir/validation/label-id-validation.js';
import type { MissingLabelIDData } from '../types/code-actions.js';
import { isDefaultImport } from '../utils/ast-helpers.js';
import { formatValidationMessage } from '../utils/error-builder.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { resolveImportRelativePath } from '../utils/path-utils.js';
import { getImports } from '../utils/program-helpers.js';
import { BaseValidator } from './base-validator.js';

/**
 * Validations for operation calls (Eligius operations, action calls, CSS/label parameters).
 */
export class OperationCallValidator extends BaseValidator {
  /**
   * Tracks document URIs whose locales imports have already been loaded into the
   * label registry. Needed because the registry size cannot be used as an
   * "is-registered" signal: a document with zero translation keys would otherwise
   * be treated as never-registered and re-read from disk on every validation cycle.
   */
  private readonly initializedLabelDocuments = new Set<string>();

  /**
   * Validate that an operation exists in the Eligius registry.
   * Provides typo suggestions for similar operation names.
   *
   * This gives instant IDE feedback with red squiggles and helpful suggestions.
   */
  checkOperationExists(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = getOperationCallName(operation);

    // T020: Skip operation validation if this is an action call
    // (Action calls are validated by checkTimelineOperationCall for direct timeline calls,
    //  or allowed in InlineEndableAction blocks)
    //
    // Feature 023: Also check for Library files
    const program = this.getProgram(operation);
    if (program) {
      const action = findActionByName(opName, program);
      if (action) {
        // This is a valid action call - skip operation validation
        return;
      }
    }

    // Feature 023: Check if operation is in a Library file
    const library = this.getLibrary(operation);
    if (library) {
      const action = library.actions?.find(a => a.name === opName);
      if (action) {
        // This is a valid action call within the library - skip operation validation
        return;
      }
    }

    // Feature 024: Check if operation is an IMPORTED action
    // Feature 032 Fix: Must check aliases as well as original action names
    if (program && this.services) {
      const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
      const importedActions = scopeProvider.getImportedActions(program);
      const importedAction = this.findImportedActionByNameOrAlias(opName, program, importedActions);
      if (importedAction) {
        // This is a valid imported action call - skip operation validation
        return;
      }
    }

    // Use compiler validation logic
    const error = validateOperationExists(opName);

    if (error) {
      const message = formatValidationMessage(error.message, error.hint);

      accept('error', message, {
        node: operation,
        property: 'operationName',
        code: error.code.toLowerCase(),
      });
    }
  }

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
    accept: ValidationAcceptor
  ): void {
    const expectedCount = parameters?.length ?? 0;
    if (argumentCount !== expectedCount) {
      const paramNames = parameters?.map(p => p.name).join(', ') ?? '';
      accept(
        'error',
        `Action '${opName}' expects ${expectedCount} argument(s) but got ${argumentCount}. Expected: ${paramNames}`,
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
          accept
        );
        return;
      }

      // Check imported action
      // Feature 032 Fix: Must check aliases as well as original action names
      if (this.services) {
        const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
        const importedActions = scopeProvider.getImportedActions(program);
        const importedAction = this.findImportedActionByNameOrAlias(
          opName,
          program,
          importedActions
        );
        if (importedAction) {
          this.reportActionParameterCountError(
            opName,
            importedAction.parameters,
            argumentCount,
            operation,
            accept
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
          accept
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

  /**
   * T020-T023: Validate OperationCall when used in timeline context
   *
   * With unified syntax, OperationCall can appear as TimelineAction.
   * We need to validate that it resolves to a defined action (not an operation).
   */
  checkTimelineOperationCall(call: OperationCall, accept: ValidationAcceptor): void {
    // Check if this OperationCall is in a direct timeline event (not in InlineEndableAction)
    const isDirectTimelineCall = this.isDirectTimelineCall(call);

    if (!isDirectTimelineCall) {
      // Not a direct timeline call - normal validation applies
      // (could be in action body, InlineEndableAction, control flow, etc.)
      return;
    }

    // Direct timeline call - must be an action call, NOT an operation
    const callName = getOperationCallName(call);

    // Get the program to search for actions
    const program = this.getProgram(call);
    if (!program) {
      return; // Can't validate without program context
    }

    // Check if it's a defined action (local)
    const action = findActionByName(callName, program);
    if (action) {
      // Valid local action call - success
      return;
    }

    // Feature 024: Check if it's an IMPORTED action
    // Feature 032 Fix: Must check aliases as well as original action names
    if (this.services) {
      const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
      const importedActions = scopeProvider.getImportedActions(program);

      // Check if callName matches an imported action's name OR its alias
      const importedAction = this.findImportedActionByNameOrAlias(
        callName,
        program,
        importedActions
      );
      if (importedAction) {
        // Valid imported action call - success
        return;
      }
    }

    // Check if it's an operation (ERROR - operations not allowed as direct timeline actions)
    if (hasOperation(callName)) {
      accept(
        'error',
        `Operation '${callName}' cannot be used directly in timeline events. Define an action that calls this operation, then call the action.`,
        {
          node: call,
          property: 'operationName',
        }
      );
      return;
    }

    // Unknown - neither action nor operation
    accept(
      'error',
      `Unknown action: ${callName}. Define this action before using it in timeline events.`,
      {
        node: call,
        property: 'operationName',
      }
    );
  }

  /**
   * Feature 032 Fix: Find imported action by name or alias
   *
   * Checks if the given name matches either:
   * - The original action name (from library)
   * - An alias used when importing the action
   *
   * @param callName - Name used in OperationCall (could be alias)
   * @param program - Program containing import statements
   * @param importedActions - List of imported action definitions
   * @returns ActionDefinition if found, undefined otherwise
   */
  private findImportedActionByNameOrAlias(
    callName: string,
    program: Program,
    importedActions: ActionDefinition[]
  ): ActionDefinition | undefined {
    // Build a map of all import aliases: alias → action
    const aliasMap = new Map<string, ActionDefinition>();

    // Get all library imports from the program
    const statements = program.statements || [];
    const libraryImports = statements.filter(isLibraryImport);

    for (const libraryImport of libraryImports) {
      for (const actionImport of libraryImport.actions) {
        const action = actionImport.action.ref;
        if (!action) continue;

        // Register the alias if present
        if (actionImport.alias) {
          aliasMap.set(actionImport.alias, action);
        }
      }
    }

    // First, check if callName is an alias
    const actionByAlias = aliasMap.get(callName);
    if (actionByAlias) {
      return actionByAlias;
    }

    // Otherwise, check if callName matches an original action name
    return importedActions.find(action => action.name === callName);
  }

  /**
   * Helper: Check if an OperationCall is a direct timeline call
   * (as opposed to being inside InlineEndableAction or action definition body)
   */
  /**
   * T053-T054: US3 - Check if OperationCall is a direct timeline call
   * Handles direct calls and calls within ForStatement/IfStatement in timelines
   *
   * Returns true only for direct timeline calls like:
   *   at 0s..5s actionCall()
   *   at 0s..5s for (...) { actionCall() }
   *
   * Returns false for:
   *   - Calls inside action definition bodies
   *   - Calls inside InlineEndableAction blocks (operations allowed there)
   */
  private isDirectTimelineCall(call: OperationCall): boolean {
    let current: any = call.$container;

    // Walk up to find if we're in a direct timeline context
    while (current) {
      // If we hit an action definition body, we're NOT a direct timeline call
      if (
        current.$type === 'RegularActionDefinition' ||
        current.$type === 'EndableActionDefinition'
      ) {
        return false;
      }

      // If we're inside an InlineEndableAction, we're NOT a direct timeline call
      // (operations are allowed inside inline endable action blocks)
      if (current.$type === 'InlineEndableAction') {
        return false;
      }

      if (current.$type === 'TimedEvent') {
        const timedEvent = current as TimedEvent;

        // Direct action: OperationCall is the timeline action itself
        if (timedEvent.action === call) {
          return true;
        }

        // T053: Control flow in timeline: Check if call is inside ForStatement/IfStatement
        // that is the timeline action
        if (
          timedEvent.action &&
          (timedEvent.action.$type === 'ForStatement' || timedEvent.action.$type === 'IfStatement')
        ) {
          // The call is somewhere inside control flow - check if it's in this timeline event
          return this.isDescendantOf(call, timedEvent.action);
        }
      }
      current = current.$container;
    }

    return false;
  }

  /**
   * T053: Helper - Check if node is a descendant of ancestor
   */
  private isDescendantOf(node: any, ancestor: any): boolean {
    let current = node.$container;
    while (current) {
      if (current === ancestor) {
        return true;
      }
      current = current.$container;
    }
    return false;
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
    const operationSignature = OPERATION_REGISTRY[operationName];
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

    const cssRegistry = this.services.css.CSSRegistry;

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
    const operationSignature = OPERATION_REGISTRY[operationName];
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

    // Get available CSS classes and IDs from imported CSS files
    const availableClasses = cssRegistry.getClassesForDocument(documentUri);
    const availableIDs = cssRegistry.getIDsForDocument(documentUri);

    // Note: If no CSS files are imported (empty sets), we still validate.
    // With no CSS imported, ALL classes/IDs are invalid since there's no external CSS in Eligian.

    // Validate each selector parameter
    for (const paramIndex of selectorParamIndices) {
      const arg = operation.args[paramIndex];
      if (!arg) continue; // Missing argument (will be caught by checkParameterCount)

      // Only validate string literals (not variables or expressions)
      if (arg.$type !== 'StringLiteral') continue;

      const selectorString = arg.value;

      // Parse the selector to extract classes and IDs
      const { classes, ids, valid, error } = parseSelector(selectorString);

      // Check for invalid selector syntax
      if (!valid) {
        accept('error', `Invalid CSS selector syntax: ${error}`, {
          node: arg,
          data: {
            code: 'invalid_css_selector',
          },
        });
        continue; // Don't validate classes/IDs if syntax is invalid
      }

      // Validate each class in the selector
      for (const className of classes) {
        if (!availableClasses.has(className)) {
          // Class not found - generate "Did you mean?" suggestions
          const suggestions = findSimilarClasses(className, availableClasses, 2, 3);

          let message = `Unknown CSS class in selector: '${className}'.`;
          if (suggestions.length > 0) {
            message += ` Did you mean: ${suggestions.join(', ')}?`;
          }

          accept('error', message, {
            node: arg,
            data: {
              code: 'unknown_css_class_in_selector',
            },
          });
        }
      }

      // Validate each ID in the selector
      for (const idName of ids) {
        if (!availableIDs.has(idName)) {
          // ID not found - no suggestions for IDs (less common to typo)
          accept('error', `Unknown CSS ID in selector: '${idName}'.`, {
            node: arg,
            data: {
              code: 'unknown_css_id_in_selector',
            },
          });
        }
      }
    }
  }

  /**
   * Feature 035: Validate addController calls (T010)
   *
   * This validator checks addController operations to ensure:
   * - First argument is a valid controller name (string literal)
   * - Controller name exists in CONTROLLERS metadata
   * - Required parameters are provided
   * - No excess parameters are provided
   *
   * Syntax: addController('ControllerName', ...args)
   *
   * @param operation - OperationCall AST node
   * @param accept - Validation acceptor for reporting errors
   */
  checkControllerCall(operation: OperationCall, accept: ValidationAcceptor): void {
    const operationName = getOperationCallName(operation);
    if (operationName !== 'addController') {
      return; // Only validate addController calls
    }

    // Check if first argument is a string literal (controller name)
    const args = operation.args || [];
    if (args.length === 0) {
      // Missing controller name (will be caught by checkParameterCount)
      return;
    }

    const firstArg = args[0];
    if (firstArg.$type !== 'StringLiteral') {
      accept(
        'error',
        "First argument of 'addController' must be a controller name (string literal)",
        {
          node: firstArg,
          data: { code: 'invalid_controller_name_type' },
        }
      );
      return;
    }

    const controllerName = firstArg.value;

    // Check if controller exists
    if (!isController(controllerName)) {
      accept('error', `Unknown controller: '${controllerName}'.`, {
        node: firstArg,
        data: { code: 'unknown_controller' },
      });
      return;
    }

    // Get controller metadata
    const controller = getController(controllerName);
    if (!controller) {
      return; // Should not happen if isController returned true
    }

    // Validate parameter count (args[0] is controller name, args[1+] are parameters)
    const paramArgs = args.slice(1); // Remove controller name from args
    const requiredParams = controller.parameters.filter(p => p.required);
    const totalParams = controller.parameters.length;

    // Check missing required parameters
    if (paramArgs.length < requiredParams.length) {
      const missingParam = requiredParams[paramArgs.length];
      accept(
        'error',
        `Missing required parameter '${missingParam.name}' for controller '${controllerName}'.`,
        {
          node: operation,
          property: 'args',
          data: { code: 'missing_required_parameter' },
        }
      );
      return;
    }

    // Check too many parameters
    if (paramArgs.length > totalParams) {
      accept(
        'error',
        `Too many parameters for controller '${controllerName}'. Expected ${totalParams} parameter(s), got ${paramArgs.length}.`,
        {
          node: operation,
          property: 'args',
          data: { code: 'too_many_parameters' },
        }
      );
      return;
    }

    // Feature 035 US2: Validate label ID parameters for LabelController
    if (controllerName === 'LabelController' && this.services) {
      const labelRegistry = this.services.labels.LabelRegistry;

      // Find the root Program node
      const programNode = this.getProgram(operation);
      const documentUri = programNode?.$document?.uri?.toString();
      if (!programNode || !documentUri) return;

      // CRITICAL: Ensure labels are registered before validation
      this.ensureLabelsImportsRegistered(programNode, documentUri);

      // Feature 041: Get labels file URI and language codes for extended diagnostic data
      const labelsFileUri = labelRegistry.getLabelsFileUri(documentUri);
      const languageCodes = extractLanguageCodes(programNode);

      // Validate labelId parameter (first parameter after controller name)
      if (paramArgs.length > 0) {
        const labelIdArg = paramArgs[0];

        // Only validate if it's a string literal (not a variable)
        if (labelIdArg.$type === 'StringLiteral') {
          const labelId = labelIdArg.value;

          const error = validateLabelID(documentUri, labelId, labelRegistry);
          if (error) {
            this.reportLabelIDError(
              labelIdArg,
              error,
              labelId,
              labelsFileUri,
              languageCodes,
              accept
            );
          }
        }
      }
    }
  }

  /**
   * Report a label-ID validation error, attaching Feature 041 quick-fix data.
   *
   * Single source of truth (D29) for the diagnostic-data block that was
   * duplicated across the LabelController argument check and the single/array
   * label-ID parameter checks. When the error is an `unknown_label_id` and the
   * labels file URI is known, the richer `MissingLabelIDData` payload is attached
   * so the quick fix can create the missing entry; otherwise only the code is.
   *
   * @param node - The string-literal node the diagnostic is reported on
   * @param error - The label-ID validation error (code, message, optional hint)
   * @param labelId - The offending label ID literal value
   * @param labelsFileUri - Labels file URI, when resolvable
   * @param languageCodes - Language codes for the quick-fix entry template
   * @param accept - Langium validation acceptor
   */
  private reportLabelIDError(
    node: AstNode,
    error: { code: string; message: string; hint?: string },
    labelId: string,
    labelsFileUri: string | undefined,
    languageCodes: string[],
    accept: ValidationAcceptor
  ): void {
    // Feature 041: Include extended diagnostic data for quick fix
    const diagnosticData: MissingLabelIDData | { code: string } =
      error.code === 'unknown_label_id' && labelsFileUri
        ? {
            code: error.code,
            labelId,
            labelsFileUri,
            languageCodes,
          }
        : { code: error.code };

    accept('error', formatValidationMessage(error.message, error.hint), {
      node,
      data: diagnosticData,
    });
  }

  /**
   * Helper to ensure labels imports are registered before validation
   *
   * Langium validators can run in any order, so we need to lazily initialize
   * the locales registry if it hasn't been populated yet. This is called from both:
   * 1. checkLocalesImports (program-level) - initial registration
   * 2. checkControllerLabelParameter (operation-level) - ensure registered before validating
   * 3. checkLabelIDParameter (operation-level) - ensure registered before validating
   *
   * @param program - AST Program node
   * @param documentUri - Document URI string
   */
  private ensureLabelsImportsRegistered(program: Program, documentUri: string): void {
    if (!this.services) return;

    // Skip if this document's locales have already been loaded. We track this in
    // a dedicated Set rather than inspecting registry size, because a document
    // with zero keys would otherwise be re-loaded on every validation cycle.
    if (this.initializedLabelDocuments.has(documentUri)) {
      return;
    }

    // Find locales imports
    const localesImports = getImports(program)
      .filter(isDefaultImport)
      .filter(imp => imp.type === 'locales');

    if (localesImports.length === 0) {
      this.initializedLabelDocuments.add(documentUri);
      return; // No locales to register
    }

    // Resolve and load each locales file into the label registry. This mirrors
    // the loading half of checkLocalesImports, but without diagnostics — those
    // are reported by checkLocalesImports itself. Inlining here guarantees the
    // registry is populated even when label-ID checks run before the
    // program-level locales validator (Langium validator ordering is not fixed).
    const labelRegistry = this.services.labels.LabelRegistry;
    const docDir = path.dirname(URI.parse(documentUri).fsPath);

    for (const localesImport of localesImports) {
      if (!localesImport.path) continue;

      // D4: shared resolution (path.join handles ./, ., ../)
      const absolutePath = resolveImportRelativePath(localesImport.path, docDir);

      if (!fs.existsSync(absolutePath)) continue;

      try {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const localeData = JSON.parse(content);
        const translationKeys = extractTranslationKeys(localeData);
        const fileUri = URI.file(absolutePath).toString();
        labelRegistry.updateLabelsFile(fileUri, translationKeys);
        labelRegistry.registerImports(documentUri, fileUri);
      } catch {
        // Parse/read errors are surfaced by checkLocalesImports; ignore here so a
        // single malformed file doesn't block registration of the others.
      }
    }

    this.initializedLabelDocuments.add(documentUri);
  }

  /**
   * Feature 034: Validate label ID parameters in operation calls
   *
   * This validator checks if label ID parameters reference valid label IDs
   * from imported labels files. It provides "Did you mean?" suggestions for typos
   * using Levenshtein distance.
   *
   * Operations with label ID parameters (from Eligius metadata):
   * - requestLabelData(labelId) - single label ID parameter
   * - loadLottieAnimation(labelIds) - array of label IDs with @itemType=ParameterType:labelId
   *
   * @param operation - OperationCall AST node
   * @param accept - Validation acceptor for reporting errors
   */
  checkLabelIDParameter(operation: OperationCall, accept: ValidationAcceptor): void {
    if (!this.services) return;

    const labelRegistry = this.services.labels.LabelRegistry;

    // Find the root Program node
    const programNode = this.getProgram(operation);
    const documentUri = programNode?.$document?.uri?.toString();
    if (!programNode || !documentUri) return;

    // CRITICAL: Ensure labels are registered before validation
    this.ensureLabelsImportsRegistered(programNode, documentUri);

    // Get operation name
    const operationName = getOperationCallName(operation);
    if (!operationName) return;

    // Check if this operation has label ID parameters
    const operationSignature = OPERATION_REGISTRY[operationName];
    if (!operationSignature) return; // Unknown operation (caught by checkOperationExists)

    // Find label ID parameter indices (both single and array with @itemType)
    const labelIDParamIndices: number[] = [];

    for (let i = 0; i < operationSignature.parameters.length; i++) {
      const param = operationSignature.parameters[i];

      // Check if parameter type array includes 'ParameterType:labelId'
      // param.type can be ParameterType[] or ConstantValue[]
      if (
        Array.isArray(param.type) &&
        param.type.some(t => typeof t === 'string' && t === 'ParameterType:labelId')
      ) {
        labelIDParamIndices.push(i);
      }
    }

    // If no label ID parameters, skip validation
    if (labelIDParamIndices.length === 0) {
      return;
    }

    // Feature 041: Get labels file URI and language codes for extended diagnostic data
    const labelsFileUri = labelRegistry.getLabelsFileUri(documentUri);
    const languageCodes = extractLanguageCodes(programNode);

    // Validate each label ID parameter
    const args = operation.args || [];

    for (const paramIndex of labelIDParamIndices) {
      const arg = args[paramIndex];
      if (!arg) continue; // Missing argument (caught by checkParameterCount)

      // Handle single string literal
      if (arg.$type === 'StringLiteral') {
        const labelId = arg.value;

        // Validate label ID
        const error = validateLabelID(documentUri, labelId, labelRegistry);
        if (error) {
          this.reportLabelIDError(arg, error, labelId, labelsFileUri, languageCodes, accept);
        }
      }
      // Handle array of label IDs
      else if (arg.$type === 'ArrayLiteral') {
        const arrayLiteral = arg as any; // ArrayLiteral type
        const elements = arrayLiteral.elements || [];

        for (const element of elements) {
          // Only validate string literals in array (skip variables, expressions)
          if (element.$type !== 'StringLiteral') continue;

          const labelId = element.value;

          // Validate label ID
          const error = validateLabelID(documentUri, labelId, labelRegistry);
          if (error) {
            this.reportLabelIDError(element, error, labelId, labelsFileUri, languageCodes, accept);
          }
        }
      }
    }
  }
}
