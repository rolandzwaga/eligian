import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AstNode, ValidationAcceptor } from 'langium';
import { URI } from 'vscode-uri';
import { OPERATION_REGISTRY } from '../../compiler/index.js';
import { getController, isController } from '../../completion/metadata/controllers.generated.js';
import type { OperationCall, Program } from '../../generated/ast.js';
import { extractLanguageCodes } from '../../labels/index.js';
import { extractTranslationKeys } from '../../locales/translation-key-extractor.js';
import { validateLabelID } from '../../type-system-typir/validation/label-id-validation.js';
import type { MissingLabelIDData } from '../../types/code-actions.js';
import { isDefaultImport } from '../../utils/ast-helpers.js';
import { formatValidationMessage } from '../../utils/error-builder.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { resolveImportRelativePath } from '../../utils/path-utils.js';
import { getImports } from '../../utils/program-helpers.js';
import { BaseValidator } from '../base-validator.js';

/**
 * Validates `addController` calls and label-ID parameters of operation calls
 * against the keys declared in imported locales/labels files (Features 034/035/041).
 *
 * Split out of the former monolithic `OperationCallValidator` (W1) as the
 * "controller / label-ID parameter" check family. Owns the lazy labels-import
 * registration state because both checks depend on the label registry being
 * populated regardless of Langium validator ordering.
 */
export class LabelParameterValidator extends BaseValidator {
  /**
   * Tracks document URIs whose locales imports have already been loaded into the
   * label registry. Needed because the registry size cannot be used as an
   * "is-registered" signal: a document with zero translation keys would otherwise
   * be treated as never-registered and re-read from disk on every validation cycle.
   */
  private readonly initializedLabelDocuments = new Set<string>();

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
