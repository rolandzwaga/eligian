/**
 * HTML Element Completion Contracts
 *
 * Defines the interfaces and types for HTML element completion in createElement.
 * These contracts define the API between:
 * - Metadata generator (build-time)
 * - Context detector (runtime)
 * - Completion provider (runtime)
 */

import type { CompletionContext, CompletionAcceptor } from 'langium/lsp';

// ============================================================================
// Generated Metadata Types (output of build-time generator)
// ============================================================================

/**
 * Metadata for a single HTML attribute
 */
export interface HTMLAttributeMetadata {
  /** Attribute name (e.g., "href", "type", "disabled") */
  readonly name: string;

  /** Value type */
  readonly type: 'string' | 'number' | 'boolean' | 'enum';

  /** Valid values when type='enum' */
  readonly enumValues?: readonly string[];

  /** Brief description for tooltip */
  readonly description?: string;

  /** Whether attribute is typically required */
  readonly required?: boolean;
}

/**
 * Metadata for an HTML element
 */
export interface HTMLElementMetadata {
  /** HTML tag name (e.g., "a", "div", "input") */
  readonly tagName: string;

  /** TypeScript interface name (e.g., "HTMLAnchorElement") */
  readonly interfaceName: string;

  /** Element-specific attributes */
  readonly attributes: readonly HTMLAttributeMetadata[];
}

/**
 * All HTML element names (type-safe)
 */
export type HTMLElementName = string; // Will be narrowed by generated code

/**
 * Generated metadata registry
 */
export interface HTMLMetadataRegistry {
  /** All valid HTML element names */
  readonly elementNames: readonly string[];

  /** Metadata for each element */
  readonly elements: Readonly<Record<string, HTMLElementMetadata>>;

  /** Common attributes (apply to all elements) */
  readonly commonAttributes: readonly HTMLAttributeMetadata[];
}

// ============================================================================
// Context Detection Types (runtime)
// ============================================================================

/**
 * Types of HTML completion contexts
 */
export enum HTMLCompletionContextType {
  /** Not in createElement context */
  None = 'None',

  /** Cursor inside element name parameter: createElement("|") */
  ElementName = 'ElementName',

  /** Cursor inside attributes object: createElement("div", { | }) */
  AttributeName = 'AttributeName',

  /** Cursor inside attribute value: createElement("div", { type: "|" }) */
  AttributeValue = 'AttributeValue',
}

/**
 * Detected HTML completion context
 */
export interface HTMLCompletionContext {
  /** Context type */
  readonly type: HTMLCompletionContextType;

  /** Element name (for AttributeName/AttributeValue contexts) */
  readonly elementName?: string;

  /** Attribute name (for AttributeValue context) */
  readonly attributeName?: string;

  /** Text typed so far (for filtering) */
  readonly partialText?: string;
}

// ============================================================================
// Function Contracts
// ============================================================================

/**
 * Contract: Detect HTML completion context from Langium context
 *
 * @param context - Langium completion context
 * @returns Detected HTML context or None if not in createElement
 */
export type DetectHTMLContext = (context: CompletionContext) => HTMLCompletionContext;

/**
 * Contract: Get element metadata by tag name
 *
 * @param elementName - HTML element name (e.g., "input")
 * @returns Element metadata or undefined if unknown element
 */
export type GetElementMetadata = (elementName: string) => HTMLElementMetadata | undefined;

/**
 * Contract: Get attributes for an element (specific + common)
 *
 * @param elementName - HTML element name
 * @returns Combined array of element-specific and common attributes
 */
export type GetElementAttributes = (elementName: string) => readonly HTMLAttributeMetadata[];

/**
 * Contract: Get enum values for an attribute
 *
 * @param elementName - HTML element name
 * @param attributeName - Attribute name
 * @returns Array of valid values or undefined if not enum type
 */
export type GetAttributeEnumValues = (
  elementName: string,
  attributeName: string
) => readonly string[] | undefined;

/**
 * Contract: Provide HTML element name completions
 *
 * @param context - Langium completion context
 * @param acceptor - Callback to accept completion items
 */
export type ProvideElementNameCompletions = (
  context: CompletionContext,
  acceptor: CompletionAcceptor
) => void;

/**
 * Contract: Provide attribute name completions for an element
 *
 * @param context - Langium completion context
 * @param elementName - HTML element name
 * @param acceptor - Callback to accept completion items
 */
export type ProvideAttributeNameCompletions = (
  context: CompletionContext,
  elementName: string,
  acceptor: CompletionAcceptor
) => void;

/**
 * Contract: Provide attribute value completions
 *
 * @param context - Langium completion context
 * @param elementName - HTML element name
 * @param attributeName - Attribute name
 * @param acceptor - Callback to accept completion items
 */
export type ProvideAttributeValueCompletions = (
  context: CompletionContext,
  elementName: string,
  attributeName: string,
  acceptor: CompletionAcceptor
) => void;

// ============================================================================
// Integration Contract (main entry point)
// ============================================================================

/**
 * Contract: HTML Completion Provider
 *
 * Main interface for HTML element completion functionality.
 * Integrates with EligianCompletionProvider.
 */
export interface HTMLCompletionProvider {
  /**
   * Check if context is an HTML completion context and provide completions
   *
   * @param context - Langium completion context
   * @param acceptor - Callback to accept completion items
   * @returns true if completions were provided, false otherwise
   */
  provideCompletions(context: CompletionContext, acceptor: CompletionAcceptor): boolean;
}
