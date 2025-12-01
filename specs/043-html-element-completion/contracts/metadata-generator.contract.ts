/**
 * HTML Metadata Generator Contract
 *
 * Defines the interface for the build-time metadata generator script.
 * This script extracts HTML element and attribute metadata from TypeScript's
 * lib.dom.d.ts using the TypeScript Compiler API.
 */

import type { HTMLAttributeMetadata, HTMLElementMetadata } from './html-completion.contract';

// ============================================================================
// Generator Configuration
// ============================================================================

/**
 * Configuration for the metadata generator
 */
export interface GeneratorConfig {
  /** Path to output generated file */
  readonly outputPath: string;

  /** Whether to include descriptions from JSDoc */
  readonly includeDescriptions: boolean;

  /** Attributes to always exclude (e.g., event handlers) */
  readonly excludePatterns: readonly RegExp[];

  /** Attributes to always include (override exclusions) */
  readonly includeOverrides: readonly string[];
}

/**
 * Default generator configuration
 */
export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  outputPath: 'packages/language/src/completion/html-elements.generated.ts',
  includeDescriptions: true,
  excludePatterns: [
    /^on[A-Z]/, // Event handlers (onClick, onFocus, etc.)
    /^aria/, // ARIA attributes (handled separately if needed)
  ],
  includeOverrides: [
    'id',
    'className',
    'style',
    'title',
    'hidden',
    'tabIndex',
  ],
};

// ============================================================================
// Generator Output Types
// ============================================================================

/**
 * Raw extraction result from TypeScript types
 */
export interface ExtractedElement {
  /** Tag name from HTMLElementTagNameMap key */
  tagName: string;

  /** Interface name from HTMLElementTagNameMap value */
  interfaceName: string;

  /** All properties from the interface */
  properties: ExtractedProperty[];
}

/**
 * Raw property extraction
 */
export interface ExtractedProperty {
  /** Property name */
  name: string;

  /** TypeScript type string (for debugging) */
  typeString: string;

  /** Detected value type */
  valueType: 'string' | 'number' | 'boolean' | 'enum' | 'other';

  /** Enum values if valueType='enum' */
  enumValues?: string[];

  /** JSDoc description if available */
  description?: string;

  /** Whether marked as deprecated */
  deprecated: boolean;

  /** Whether this is a method (should be excluded) */
  isMethod: boolean;
}

/**
 * Final generated output structure
 */
export interface GeneratedOutput {
  /** Timestamp of generation */
  generatedAt: string;

  /** TypeScript version used */
  typescriptVersion: string;

  /** All element names */
  elementNames: string[];

  /** Element metadata map */
  elements: Record<string, HTMLElementMetadata>;

  /** Common attributes */
  commonAttributes: HTMLAttributeMetadata[];
}

// ============================================================================
// Generator Function Contracts
// ============================================================================

/**
 * Contract: Extract HTMLElementTagNameMap from TypeScript
 *
 * @returns Map of tag names to interface names
 */
export type ExtractElementTagNameMap = () => Map<string, string>;

/**
 * Contract: Extract properties from an interface
 *
 * @param interfaceName - Name of the interface (e.g., "HTMLAnchorElement")
 * @returns Array of extracted properties
 */
export type ExtractInterfaceProperties = (interfaceName: string) => ExtractedProperty[];

/**
 * Contract: Filter properties to relevant attributes
 *
 * @param properties - Raw extracted properties
 * @param config - Generator configuration
 * @returns Filtered attributes suitable for completion
 */
export type FilterToAttributes = (
  properties: ExtractedProperty[],
  config: GeneratorConfig
) => HTMLAttributeMetadata[];

/**
 * Contract: Generate TypeScript code from metadata
 *
 * @param output - Generated output data
 * @returns TypeScript source code string
 */
export type GenerateTypeScriptCode = (output: GeneratedOutput) => string;

/**
 * Contract: Main generator entry point
 *
 * @param config - Generator configuration
 * @returns Generated output (also writes to file)
 */
export type GenerateHTMLMetadata = (config?: Partial<GeneratorConfig>) => Promise<GeneratedOutput>;

// ============================================================================
// Expected Generated File Structure
// ============================================================================

/**
 * Template for the generated file structure:
 *
 * ```typescript
 * // html-elements.generated.ts
 * // AUTO-GENERATED - DO NOT EDIT
 * // Generated: 2025-12-01T00:00:00.000Z
 * // TypeScript: 5.x.x
 *
 * export const HTML_ELEMENT_NAMES = ['a', 'abbr', ...] as const;
 *
 * export type HTMLElementName = typeof HTML_ELEMENT_NAMES[number];
 *
 * export interface HTMLAttributeMetadata {
 *   readonly name: string;
 *   readonly type: 'string' | 'number' | 'boolean' | 'enum';
 *   readonly enumValues?: readonly string[];
 *   readonly description?: string;
 * }
 *
 * export interface HTMLElementMetadata {
 *   readonly tagName: string;
 *   readonly interfaceName: string;
 *   readonly attributes: readonly HTMLAttributeMetadata[];
 * }
 *
 * export const HTML_ELEMENT_ATTRIBUTES: Record<HTMLElementName, HTMLElementMetadata> = {
 *   a: {
 *     tagName: 'a',
 *     interfaceName: 'HTMLAnchorElement',
 *     attributes: [
 *       { name: 'href', type: 'string' },
 *       { name: 'target', type: 'enum', enumValues: ['_self', '_blank', '_parent', '_top'] },
 *       ...
 *     ]
 *   },
 *   ...
 * };
 *
 * export const COMMON_HTML_ATTRIBUTES: readonly HTMLAttributeMetadata[] = [
 *   { name: 'id', type: 'string' },
 *   { name: 'className', type: 'string' },
 *   ...
 * ];
 * ```
 */
