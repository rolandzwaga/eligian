/**
 * Contract: Controller Hover Provider API
 *
 * Defines the interface for providing IDE hover documentation for
 * addController operation calls.
 *
 * Feature: 035-specialized-controller-syntax
 * User Stories: US3 (P3)
 */

import type { Hover, HoverParams } from 'vscode-languageserver';
import type { ControllerMetadata } from './metadata-generator.contract.js';

/**
 * Controller Hover Provider Service
 *
 * Provides hover documentation for controller names and parameters.
 */
export interface IControllerHoverProvider {
  /**
   * Provide hover documentation for controller name
   *
   * Shows:
   * - Controller description
   * - Required parameters with types
   * - Optional parameters with types and defaults
   * - Dependency information
   *
   * @param params - LSP hover parameters (position, document URI)
   * @param controllerName - The controller name being hovered
   * @returns Hover content with formatted documentation
   *
   * @example
   * // User hovers over 'LabelController' in:
   * // addController('LabelController', "mainTitle")
   * provideControllerHover(params, 'LabelController')
   * // → {
   * //   contents: {
   * //     kind: 'markdown',
   * //     value: `
   * // ### LabelController
   * //
   * // This controller attaches to the given selected element and renders
   * // the text associated with the given label id in it.
   * //
   * // The controller also listen for the \`LANGUAGE_CHANGE\` event and
   * // re-renders the text with the new language after such an event.
   * //
   * // **Required Parameters:**
   * // - \`labelId\` (labelId) - Label ID reference
   * //
   * // **Optional Parameters:**
   * // - \`attributeName\` (string) - Attribute name to set
   * //
   * // **Dependencies:**
   * // - selectedElement
   * //     `
   * //   }
   * // }
   */
  provideControllerHover(params: HoverParams, controllerName: string): Hover | undefined;

  /**
   * Provide hover documentation for parameter
   *
   * Shows:
   * - Parameter name and type
   * - Parameter description (if available)
   * - Required/optional status
   * - Default value (if optional)
   * - For labelId: Label metadata (translation count, languages) from Feature 034
   *
   * @param params - LSP hover parameters
   * @param controllerName - The controller name
   * @param parameterName - The parameter being hovered
   * @returns Hover content with formatted documentation
   *
   * @example
   * // User hovers over "mainTitle" in:
   * // addController('LabelController', "mainTitle")
   * provideParameterHover(params, 'LabelController', 'labelId')
   * // → {
   * //   contents: {
   * //     kind: 'markdown',
   * //     value: `
   * // **Parameter:** \`labelId\` (labelId, required)
   * //
   * // Label ID reference
   * //
   * // **Label:** mainTitle
   * // - Translations: 3 languages (en, de, fr)
   * // - Default language: en
   * //     `
   * //   }
   * // }
   *
   * @example
   * // User hovers over url parameter in:
   * // addController('LottieController', "./animation.json")
   * provideParameterHover(params, 'LottieController', 'url')
   * // → {
   * //   contents: {
   * //     kind: 'markdown',
   * //     value: `
   * // **Parameter:** \`url\` (url, required)
   * //
   * // Lottie animation URL
   * //     `
   * //   }
   * // }
   */
  provideParameterHover(
    params: HoverParams,
    controllerName: string,
    parameterName: string
  ): Hover | undefined;

  /**
   * Format controller metadata as markdown
   *
   * @param metadata - Controller metadata to format
   * @returns Markdown string for hover display
   *
   * @example
   * formatControllerDocumentation(labelControllerMetadata)
   * // → Multi-line markdown string (see provideControllerHover example)
   */
  formatControllerDocumentation(metadata: ControllerMetadata): string;

  /**
   * Format parameter metadata as markdown
   *
   * @param parameterMetadata - Parameter metadata to format
   * @param labelInfo - Optional label information from Feature 034
   * @returns Markdown string for hover display
   *
   * @example
   * formatParameterDocumentation(
   *   { name: "labelId", type: "ParameterType:labelId", required: true },
   *   { id: "mainTitle", translationCount: 3, languages: ["en", "de", "fr"] }
   * )
   * // → Multi-line markdown string (see provideParameterHover example)
   */
  formatParameterDocumentation(
    parameterMetadata: ControllerMetadata['parameters'][number],
    labelInfo?: LabelInfo
  ): string;
}

/**
 * Label Information (from Feature 034)
 *
 * Metadata about a label ID for enhanced hover documentation.
 */
export interface LabelInfo {
  /** Label ID */
  id: string;

  /** Number of translations available */
  translationCount: number;

  /** Array of language codes */
  languages: string[];

  /** Default language code */
  defaultLanguage?: string;

  /** Source file path */
  sourceFile?: string;
}

/**
 * Hover Context
 *
 * Information about what to show in hover tooltip.
 */
export type HoverContext =
  | {
      type: 'controller-name';
      controllerName: string;
      metadata: ControllerMetadata;
    }
  | {
      type: 'parameter';
      controllerName: string;
      parameterName: string;
      parameterMetadata: ControllerMetadata['parameters'][number];
      labelInfo?: LabelInfo;
    }
  | {
      type: 'none';
    };
