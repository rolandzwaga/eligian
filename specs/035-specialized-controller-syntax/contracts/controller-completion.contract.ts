/**
 * Contract: Controller Completion Provider API
 *
 * Defines the interface for providing IDE autocomplete suggestions for
 * addController operation calls.
 *
 * Feature: 035-specialized-controller-syntax
 * User Stories: US3 (P3)
 */

import type { CompletionItem, CompletionParams } from 'vscode-languageserver';
import type { ControllerMetadata } from './metadata-generator.contract.js';

/**
 * Controller Completion Provider Service
 *
 * Provides autocomplete suggestions for controller names and parameters.
 */
export interface IControllerCompletionProvider {
  /**
   * Provide controller name completions
   *
   * Triggered when cursor is in first argument position of addController call.
   * Returns all controller names from CONTROLLERS array with descriptions.
   *
   * @param params - LSP completion parameters (position, document URI)
   * @returns Array of completion items for controller names
   *
   * @example
   * // User types: addController('|')
   * // Cursor at |
   * provideControllerNames(params)
   * // → [
   * //   {
   * //     label: "LabelController",
   * //     kind: CompletionItemKind.Class,
   * //     documentation: "This controller attaches to...",
   * //     insertText: "LabelController"
   * //   },
   * //   {
   * //     label: "NavigationController",
   * //     kind: CompletionItemKind.Class,
   * //     documentation: "",
   * //     insertText: "NavigationController"
   * //   },
   * //   ...
   * // ]
   */
  provideControllerNames(params: CompletionParams): CompletionItem[];

  /**
   * Provide parameter completions based on controller type
   *
   * Triggered when cursor is in parameter argument positions.
   * Provides type-specific suggestions:
   * - For labelId: Available label IDs from LabelRegistryService
   * - For other types: Type hint only (no specific values)
   *
   * @param params - LSP completion parameters
   * @param controllerName - The controller name from first argument
   * @param parameterIndex - Which parameter position (0 = first parameter after controller name)
   * @returns Array of completion items for that parameter
   *
   * @example
   * // User types: addController('LabelController', '|')
   * // Cursor at |
   * provideParameterCompletions(params, 'LabelController', 0)
   * // → [
   * //   {
   * //     label: "mainTitle",
   * //     kind: CompletionItemKind.Value,
   * //     documentation: "Label with 3 translations (en, de, fr)",
   * //     insertText: "mainTitle"
   * //   },
   * //   {
   * //     label: "subtitle",
   * //     kind: CompletionItemKind.Value,
   * //     documentation: "Label with 2 translations (en, de)",
   * //     insertText: "subtitle"
   * //   },
   * //   ...
   * // ]
   *
   * @example
   * // User types: addController('NavigationController', |)
   * // Cursor at |
   * provideParameterCompletions(params, 'NavigationController', 0)
   * // → [
   * //   {
   * //     label: "json (object)",
   * //     kind: CompletionItemKind.TypeParameter,
   * //     documentation: "Navigation configuration object",
   * //     insertText: ""
   * //   }
   * // ]
   */
  provideParameterCompletions(
    params: CompletionParams,
    controllerName: string,
    parameterIndex: number
  ): CompletionItem[];

  /**
   * Determine completion context
   *
   * Analyzes cursor position to determine what completions to provide:
   * - Controller name position (first argument)
   * - Parameter position (subsequent arguments)
   * - Not in addController call
   *
   * @param params - LSP completion parameters
   * @returns Completion context information
   *
   * @example
   * // addController('|')
   * getCompletionContext(params)
   * // → { type: 'controller-name', argumentIndex: 0 }
   *
   * // addController('LabelController', '|')
   * getCompletionContext(params)
   * // → {
   * //   type: 'parameter',
   * //   argumentIndex: 1,
   * //   controllerName: 'LabelController',
   * //   parameterIndex: 0
   * // }
   *
   * // someOtherCall('|')
   * getCompletionContext(params)
   * // → { type: 'none' }
   */
  getCompletionContext(params: CompletionParams): CompletionContext;
}

/**
 * Completion Context
 *
 * Information about what kind of completion to provide.
 */
export type CompletionContext =
  | {
      type: 'controller-name';
      argumentIndex: 0;
    }
  | {
      type: 'parameter';
      argumentIndex: number;
      controllerName: string;
      parameterIndex: number;
      parameterMetadata: ControllerMetadata['parameters'][number];
    }
  | {
      type: 'none';
    };

/**
 * Performance Requirements (from spec SC-005)
 *
 * - Controller name completions: <300ms
 * - Parameter completions: <300ms
 * - Label ID lookups: <100ms (via LabelRegistryService)
 */
export const PERFORMANCE_TARGETS = {
  CONTROLLER_NAMES: 300, // ms
  PARAMETERS: 300, // ms
  LABEL_ID_LOOKUP: 100, // ms
} as const;
