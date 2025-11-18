/**
 * Contract: Controller Transformer API
 *
 * Defines the interface for transforming addController operation calls to
 * Eligius JSON (getControllerInstance + addControllerToElement operations).
 *
 * Feature: 035-specialized-controller-syntax
 * User Stories: US1 (P1)
 */

import type { OperationCall } from '../../../packages/language/src/generated/ast.js';
import type { ControllerMetadata } from './metadata-generator.contract.js';

/**
 * Transformed Controller Operations
 *
 * The Eligius JSON operations generated from an addController call.
 */
export interface TransformedControllerOperations {
  /** First operation: Instantiate controller */
  getControllerInstance: {
    systemName: 'getControllerInstance';
    operationData: {
      /** Controller class name (e.g., "LabelController") */
      systemName: string;
    };
  };

  /** Second operation: Attach controller to element */
  addControllerToElement: {
    systemName: 'addControllerToElement';
    /** Parameter name → value mapping */
    operationData: Record<string, unknown>;
  };
}

/**
 * Controller Transformer Service
 *
 * Transforms addController operation calls to Eligius JSON operations.
 */
export interface IControllerTransformer {
  /**
   * Transform an addController call to Eligius JSON operations
   *
   * Workflow:
   * 1. Extract controller name from first argument (must be string literal)
   * 2. Map remaining arguments to parameter names using controller metadata order
   * 3. Generate getControllerInstance operation with controller systemName
   * 4. Generate addControllerToElement operation with parameter object
   * 5. Preserve source location for debugging
   *
   * @param call - The operation call AST node
   * @param metadata - Controller metadata for parameter mapping
   * @returns Tuple of [getControllerInstance, addControllerToElement] operations
   *
   * @throws Error if controller name is not a string literal
   * @throws Error if argument count doesn't match parameter count
   *
   * @example
   * // Input: addController('LabelController', "mainTitle")
   * transformControllerAddition(call, labelControllerMetadata)
   * // → [
   * //   {
   * //     systemName: "getControllerInstance",
   * //     operationData: { systemName: "LabelController" }
   * //   },
   * //   {
   * //     systemName: "addControllerToElement",
   * //     operationData: { labelId: "mainTitle" }
   * //   }
   * // ]
   *
   * @example
   * // Input: addController('SubtitlesController', "en", subtitleData)
   * transformControllerAddition(call, subtitlesControllerMetadata)
   * // → [
   * //   {
   * //     systemName: "getControllerInstance",
   * //     operationData: { systemName: "SubtitlesController" }
   * //   },
   * //   {
   * //     systemName: "addControllerToElement",
   * //     operationData: {
   * //       language: "en",
   * //       subtitleData: subtitleData
   * //     }
   * //   }
   * // ]
   */
  transformControllerAddition(
    call: OperationCall,
    metadata: ControllerMetadata
  ): [
    TransformedControllerOperations['getControllerInstance'],
    TransformedControllerOperations['addControllerToElement']
  ];

  /**
   * Map positional arguments to named parameters
   *
   * Uses controller metadata parameter order to map args[1..n] to parameter names.
   *
   * @param args - Array of argument expressions (excluding controller name)
   * @param parameters - Controller parameter metadata array
   * @returns Object mapping parameter name → argument expression value
   *
   * @example
   * mapArgumentsToParameters(
   *   [stringLiteral("mainTitle"), stringLiteral("data-label")],
   *   [
   *     { name: "labelId", ... },
   *     { name: "attributeName", ... }
   *   ]
   * )
   * // → { labelId: "mainTitle", attributeName: "data-label" }
   */
  mapArgumentsToParameters(
    args: unknown[],
    parameters: ControllerMetadata['parameters']
  ): Record<string, unknown>;

  /**
   * Extract controller name from first argument
   *
   * @param call - The operation call AST node
   * @returns Controller class name as string
   * @throws Error if first argument is not a string literal
   *
   * @example
   * // addController('LabelController', ...)
   * extractControllerName(call)
   * // → "LabelController"
   *
   * // addController(variableName, ...)
   * extractControllerName(call)
   * // → Error: "Controller name must be a string literal"
   */
  extractControllerName(call: OperationCall): string;
}

/**
 * Transformation Error
 *
 * Error thrown during transformation if preconditions fail.
 */
export class ControllerTransformationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NON_LITERAL_CONTROLLER_NAME'
      | 'ARGUMENT_PARAMETER_MISMATCH'
      | 'MISSING_METADATA',
    public readonly node?: unknown
  ) {
    super(message);
    this.name = 'ControllerTransformationError';
  }
}
